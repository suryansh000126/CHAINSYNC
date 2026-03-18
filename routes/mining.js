const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const MiningSession = require('../models/MiningSession');
const Portfolio = require('../models/Portfolio');
const axios = require('axios');
const blockchain = require('../utils/blockchain');

const COINGECKO_API = process.env.COINGECKO_API || 'https://api.coingecko.com/api/v3';

// Mining difficulty and reward config per coin
const MINING_CONFIG = {
  XMR: { difficulty: 6, blockReward: 0.0003, coinGeckoId: 'monero' },
  BTC: { difficulty: 10, blockReward: 0.00000001, coinGeckoId: 'bitcoin' },
  ETH: { difficulty: 8, blockReward: 0.00001, coinGeckoId: 'ethereum' },
  LTC: { difficulty: 5, blockReward: 0.0005, coinGeckoId: 'litecoin' },
  DOGE: { difficulty: 3, blockReward: 0.5, coinGeckoId: 'dogecoin' }
};

/**
 * POST /api/mining/start
 * Start a new mining session
 */
router.post('/start', auth, async (req, res) => {
  try {
    const { coin, hardwareType, threads } = req.body;

    const coinUpper = (coin || 'XMR').toUpperCase();
    if (!MINING_CONFIG[coinUpper]) {
      return res.status(400).json({ error: `Unsupported mining coin: ${coinUpper}` });
    }

    // Check if already mining
    const activeSession = await MiningSession.findOne({
      userId: req.user.userId,
      isActive: true
    });

    if (activeSession) {
      return res.status(400).json({
        error: 'Already mining. Stop the current session first.',
        session: activeSession
      });
    }

    const session = new MiningSession({
      userId: req.user.userId,
      coin: coinUpper,
      hardwareType: hardwareType || 'cpu',
      threads: Math.min(parseInt(threads) || 1, 16)
    });

    await session.save();

    res.status(201).json({
      session,
      config: MINING_CONFIG[coinUpper],
      message: `Mining ${coinUpper} started with ${session.threads} ${session.hardwareType.toUpperCase()} threads.`
    });
  } catch (error) {
    console.error('Mining start error:', error);
    res.status(500).json({ error: 'Failed to start mining.' });
  }
});

/**
 * POST /api/mining/submit-share
 * Submit a valid mining share (called by the Web Worker via frontend)
 */
router.post('/submit-share', auth, async (req, res) => {
  try {
    const { sessionId, hashrate } = req.body;

    const session = await MiningSession.findOne({
      _id: sessionId,
      userId: req.user.userId,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({ error: 'No active mining session found.' });
    }

    const config = MINING_CONFIG[session.coin];

    session.sharesFound += 1;
    session.hashrate = hashrate || session.hashrate;

    // Probability-based share acceptance (simulates pool acceptance)
    const accepted = Math.random() > 0.15; // 85% acceptance rate
    if (accepted) {
      session.sharesAccepted += 1;
      session.earnings += config.blockReward;
    }

    await session.save();

    res.json({
      accepted,
      sharesFound: session.sharesFound,
      sharesAccepted: session.sharesAccepted,
      earnings: session.earnings,
      hashrate: session.hashrate
    });
  } catch (error) {
    console.error('Share submit error:', error);
    res.status(500).json({ error: 'Failed to submit share.' });
  }
});

/**
 * POST /api/mining/stop
 * Stop mining session and credit earnings to portfolio
 */
router.post('/stop', auth, async (req, res) => {
  try {
    const session = await MiningSession.findOne({
      userId: req.user.userId,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({ error: 'No active mining session.' });
    }

    session.isActive = false;
    session.endTime = new Date();
    await session.save();

    let mintTxHash = null;

    // Credit mined coins to portfolio
    if (session.earnings > 0) {
      const config = MINING_CONFIG[session.coin];

      // Get current price
      let currentPrice = 0;
      try {
        const priceRes = await axios.get(`${COINGECKO_API}/simple/price`, {
          params: { ids: config.coinGeckoId, vs_currencies: 'usd' }
        });
        currentPrice = priceRes.data[config.coinGeckoId]?.usd || 0;
      } catch (e) {
        console.error('Price fetch during mining credit:', e.message);
      }

      // Add to portfolio
      const existing = await Portfolio.findOne({
        userId: req.user.userId,
        coinSymbol: session.coin,
        source: 'mining'
      });

      if (existing) {
        existing.amount += session.earnings;
        existing.buyPrice = 0; // Mined coins have 0 cost basis
        await existing.save();
      } else {
        await new Portfolio({
          userId: req.user.userId,
          coinSymbol: session.coin,
          amount: session.earnings,
          buyPrice: 0,
          source: 'mining'
        }).save();
      }

      // Mint CST tokens on-chain (if blockchain is configured)
      if (blockchain.isBlockchainEnabled() && req.user.walletAddress && req.user.walletAddress !== '0xadmin') {
        try {
          // For simplicity, mint 1 CST per 1 unit of earnings
          const cstAmount = session.earnings;
          const mintResult = await blockchain.mintTokens(req.user.walletAddress, cstAmount);
          mintTxHash = mintResult.txHash;
        } catch (mintErr) {
          console.error('On-chain mint error:', mintErr.message);
          // Continue — portfolio credit still works even if on-chain mint fails
        }
      }
    }

    const durationMs = session.endTime - session.startTime;
    const durationMins = Math.round(durationMs / 60000);

    res.json({
      session,
      credited: session.earnings > 0,
      mintTxHash,
      onChain: !!mintTxHash,
      message: `Mining stopped. ${session.earnings.toFixed(8)} ${session.coin} mined in ${durationMins} minutes and added to your portfolio.${mintTxHash ? ' CST tokens minted on-chain!' : ''}`
    });
  } catch (error) {
    console.error('Mining stop error:', error);
    res.status(500).json({ error: 'Failed to stop mining.' });
  }
});

/**
 * GET /api/mining/stats
 * Get current mining session stats
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const session = await MiningSession.findOne({
      userId: req.user.userId,
      isActive: true
    });

    if (!session) {
      return res.json({ isActive: false });
    }

    const elapsed = Date.now() - session.startTime;
    const hoursElapsed = elapsed / 3600000;

    res.json({
      isActive: true,
      session,
      elapsed,
      hashesPerSecond: session.hashrate,
      earningsPerHour: hoursElapsed > 0 ? session.earnings / hoursElapsed : 0
    });
  } catch (error) {
    console.error('Mining stats error:', error);
    res.status(500).json({ error: 'Failed to fetch mining stats.' });
  }
});

/**
 * GET /api/mining/history
 * Get past mining sessions
 */
router.get('/history', auth, async (req, res) => {
  try {
    const sessions = await MiningSession.find({
      userId: req.user.userId,
      isActive: false
    }).sort({ endTime: -1 }).limit(20);

    res.json(sessions);
  } catch (error) {
    console.error('Mining history error:', error);
    res.status(500).json({ error: 'Failed to fetch mining history.' });
  }
});

module.exports = router;
