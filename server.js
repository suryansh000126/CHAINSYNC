require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// ===== Security Middleware =====
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for frontend
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Try again later.' }
});
app.use('/api/', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Serve Static Frontend =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== MongoDB Connection =====
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chainsync';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️  Server will run without database. Some features may not work.');
  });

// ===== API Routes =====
const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const vaultRoutes = require('./routes/vault');
const tradingRoutes = require('./routes/trading');
const miningRoutes = require('./routes/mining');
const nftRoutes = require('./routes/nft');
const blockchainRoutes = require('./routes/blockchain');

app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/trade', tradingRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/nfts', nftRoutes);
app.use('/api/blockchain', blockchainRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ===== Binance WebSocket Price Proxy =====
const wss = new WebSocket.Server({ server, path: '/ws/prices' });

let binanceWs = null;
let latestPrices = {};

function connectBinance() {
  const BINANCE_URL = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';
  const streams = [
    'btcusdt@ticker', 'ethusdt@ticker', 'solusdt@ticker', 'dogeusdt@ticker',
    'adausdt@ticker', 'xrpusdt@ticker', 'dotusdt@ticker', 'maticusdt@ticker',
    'avaxusdt@ticker', 'linkusdt@ticker', 'uniusdt@ticker', 'ltcusdt@ticker',
    'bnbusdt@ticker', 'xmrusdt@ticker', 'trxusdt@ticker', 'shibusdt@ticker',
    'atomusdt@ticker', 'nearusdt@ticker', 'arbusdt@ticker', 'suiusdt@ticker',
    'aptusdt@ticker', 'seiusdt@ticker', 'pepeusdt@ticker', 'opusdt@ticker'
  ];

  const wsUrl = `${BINANCE_URL}/${streams.join('/')}`;

  try {
    binanceWs = new WebSocket(wsUrl);

    binanceWs.on('open', () => {
      console.log('✅ Binance WebSocket connected');
    });

    binanceWs.on('message', (data) => {
      try {
        const ticker = JSON.parse(data);
        if (ticker.s && ticker.c) {
          const symbol = ticker.s.replace('USDT', '');
          latestPrices[symbol] = {
            symbol,
            price: parseFloat(ticker.c),
            change24h: parseFloat(ticker.P),
            high24h: parseFloat(ticker.h),
            low24h: parseFloat(ticker.l),
            volume: parseFloat(ticker.v)
          };

          // Broadcast to connected frontend clients
          const payload = JSON.stringify({
            type: 'price_update',
            data: latestPrices[symbol]
          });

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    binanceWs.on('close', () => {
      console.log('⚠️  Binance WebSocket closed. Reconnecting in 5s...');
      setTimeout(connectBinance, 5000);
    });

    binanceWs.on('error', (err) => {
      console.error('Binance WS error:', err.message);
    });
  } catch (err) {
    console.error('Failed to connect Binance WS:', err.message);
    setTimeout(connectBinance, 10000);
  }
}

// Start Binance connection
connectBinance();

// WebSocket connection handler for frontend clients
wss.on('connection', (ws) => {
  console.log('📡 Frontend WebSocket client connected');

  // Send all current prices on connect
  ws.send(JSON.stringify({
    type: 'price_snapshot',
    data: latestPrices
  }));

  ws.on('close', () => {
    console.log('📡 Frontend WebSocket client disconnected');
  });
});

// REST endpoint for latest prices (fallback if WebSocket not available)
app.get('/api/prices/snapshot', (req, res) => {
  res.json(latestPrices);
});

// ===== Frontend Routes =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Catch-all: serve index for SPA routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║   ChainSync Platform — Running          ║
  ║   http://localhost:${PORT}                  ║
  ║   WebSocket: ws://localhost:${PORT}/ws/prices║
  ╚══════════════════════════════════════════╝
    `);
  });
}

// Export the Express API for Vercel
module.exports = app;
