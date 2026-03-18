const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trade = require('../models/Trade');
const Portfolio = require('../models/Portfolio');
const axios = require('axios');

const blockchain = require('../utils/blockchain');
const ai = require('../utils/ai');

const COINGECKO_API = process.env.COINGECKO_API || 'https://api.coingecko.com/api/v3';

// Symbol → CoinGecko ID map
const SYMBOL_TO_ID = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin',
  ada: 'cardano', xrp: 'ripple', dot: 'polkadot', matic: 'matic-network',
  avax: 'avalanche-2', link: 'chainlink', uni: 'uniswap', ltc: 'litecoin',
  bnb: 'binancecoin', xmr: 'monero', trx: 'tron', shib: 'shiba-inu',
  atom: 'cosmos', near: 'near', arb: 'arbitrum', op: 'optimism',
  sui: 'sui', pepe: 'pepe', apt: 'aptos', sei: 'sei-network'
};

/**
 * GET /api/prices/live
 * Get live prices for specified coins
 * Query: ?coins=btc,eth,sol
 */
router.get('/prices/live', async (req, res) => {
  try {
    const coins = (req.query.coins || 'btc,eth,sol').split(',');
    const ids = coins.map(c => SYMBOL_TO_ID[c.toLowerCase().trim()]).filter(Boolean);

    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid coin symbols provided.' });
    }

    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: ids.join(','),
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_24hr_vol: true,
        include_market_cap: true
      }
    });

    // Map back to symbols
    const result = {};
    for (const [symbol, id] of Object.entries(SYMBOL_TO_ID)) {
      if (response.data[id]) {
        result[symbol.toUpperCase()] = {
          price: response.data[id].usd,
          change24h: response.data[id].usd_24h_change,
          volume24h: response.data[id].usd_24h_vol,
          marketCap: response.data[id].usd_market_cap
        };
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Price fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch prices.' });
  }
});

/**
 * GET /api/prices/markets
 * Get top coins market data with sparklines for AI analysis
 */
router.get('/prices/markets', async (req, res) => {
  try {
    const perPage = req.query.limit || 50;
    const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: perPage,
        page: 1,
        sparkline: true,
        price_change_percentage: '1h,24h,7d'
      }
    });

    const markets = response.data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      currentPrice: coin.current_price,
      marketCap: coin.market_cap,
      rank: coin.market_cap_rank,
      volume24h: coin.total_volume,
      change1h: coin.price_change_percentage_1h_in_currency,
      change24h: coin.price_change_percentage_24h_in_currency,
      change7d: coin.price_change_percentage_7d_in_currency,
      sparkline: coin.sparkline_in_7d ? coin.sparkline_in_7d.price : [],
      high24h: coin.high_24h,
      low24h: coin.low_24h
    }));

    res.json(markets);
  } catch (error) {
    console.error('Markets fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch market data.' });
  }
});

/**
 * GET /api/prices/ai-picks
 * AI Premium: Analyze and score top coins
 */
router.get('/prices/ai-picks', auth, async (req, res) => {
  try {
    const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 20, // Give AI the top 20 to pick 3 from
        page: 1,
        sparkline: false,
        price_change_percentage: '24h,7d'
      }
    });

    let topPicks = [];
    
    try {
      // Prepare lightweight data to save tokens
      const rawData = response.data.map(c => ({
        id: c.id, 
        symbol: c.symbol.toUpperCase(), 
        name: c.name, 
        price: c.current_price, 
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
        volume: c.total_volume, 
        marketCap: c.market_cap
      }));
      
      const aiResponse = await ai.generateMarketAnalysis(rawData);
      
      // Merge AI response with images and live prices from CoinGecko
      topPicks = aiResponse.map((pick, i) => {
        const coinData = response.data.find(c => c.id.toLowerCase() === pick.id.toLowerCase()) || response.data[i];
        return {
          ...pick,
          image: coinData.image,
          price: coinData.current_price,
          change24h: coinData.price_change_percentage_24h_in_currency
        };
      });
      
    } catch(aiError) {
      console.error('Gemini API failed, falling back to basic algorithm:', aiError.message);
      
      // Fallback logic if API key is wrong or rate limited
      const scored = response.data.slice(0, 3).map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.image,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h_in_currency,
        score: Math.floor(Math.random() * 20) + 80, // Fake score
        risk: 'Medium',
        momentum: 'Fallback Data'
      }));
      topPicks = scored;
    }

    res.json({
      topPicks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI picks error:', error.message);
    res.status(500).json({ error: 'Failed to analyze market.' });
  }
});

/**
 * POST /api/trade
 * Execute a trade (with real prices)
 */
router.post('/', auth, async (req, res) => {
  try {
    const { pair, type, amount, orderType, isBot } = req.body;

    if (!pair || !type || !amount) {
      return res.status(400).json({ error: 'pair, type, and amount are required.' });
    }

    // Get current price for the coin
    const baseCoin = pair.split('/')[0].toLowerCase().trim();
    const coinId = SYMBOL_TO_ID[baseCoin];

    if (!coinId) {
      return res.status(400).json({ error: `Unsupported coin: ${baseCoin}` });
    }

    const priceRes = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: { ids: coinId, vs_currencies: 'usd' }
    });

    const currentPrice = priceRes.data[coinId]?.usd;
    if (!currentPrice) {
      return res.status(500).json({ error: 'Could not fetch current price.' });
    }

    const total = parseFloat(amount) * currentPrice;

    const trade = new Trade({
      userId: req.user.userId,
      pair: pair.toUpperCase(),
      type,
      orderType: orderType || 'market',
      amount: parseFloat(amount),
      price: currentPrice,
      total,
      isBot: isBot || false
    });

    await trade.save();

    // Update portfolio
    if (type === 'buy') {
      // Add to portfolio or increment
      const existing = await Portfolio.findOne({
        userId: req.user.userId,
        coinSymbol: baseCoin.toUpperCase()
      });

      if (existing) {
        const totalAmount = existing.amount + parseFloat(amount);
        const avgPrice = ((existing.amount * existing.buyPrice) + (parseFloat(amount) * currentPrice)) / totalAmount;
        existing.amount = totalAmount;
        existing.buyPrice = avgPrice;
        await existing.save();
      } else {
        await new Portfolio({
          userId: req.user.userId,
          coinSymbol: baseCoin.toUpperCase(),
          amount: parseFloat(amount),
          buyPrice: currentPrice,
          source: 'trade'
        }).save();
      }
    } else if (type === 'sell') {
      const existing = await Portfolio.findOne({
        userId: req.user.userId,
        coinSymbol: baseCoin.toUpperCase()
      });

      if (existing) {
        existing.amount -= parseFloat(amount);
        if (existing.amount <= 0) {
          await Portfolio.deleteOne({ _id: existing._id });
        } else {
          await existing.save();
        }
      }
    }

    res.status(201).json({
      trade,
      message: `${type.toUpperCase()} order executed: ${amount} ${baseCoin.toUpperCase()} at $${currentPrice.toLocaleString()}`
    });
  } catch (error) {
    console.error('Trade error:', error);
    res.status(500).json({ error: 'Trade execution failed.' });
  }
});

/**
 * GET /api/trades
 * Get trade history
 */
router.get('/', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = await Trade.find({ userId: req.user.userId })
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(trades);
  } catch (error) {
    console.error('Trade history error:', error);
    res.status(500).json({ error: 'Failed to fetch trade history.' });
  }
});

/**
 * POST /api/trade/prepare
 * Prepare an on-chain CST token transfer for MetaMask signing.
 * Returns the unsigned transaction data.
 */
router.post('/prepare', auth, async (req, res) => {
  try {
    const { pair, type, amount } = req.body;

    if (!pair || !type || !amount) {
      return res.status(400).json({ error: 'pair, type, and amount are required.' });
    }

    if (!blockchain.isBlockchainEnabled()) {
      return res.status(503).json({ error: 'Blockchain not configured. Trades are database-only.' });
    }

    const baseCoin = pair.split('/')[0].toLowerCase().trim();
    const coinId = SYMBOL_TO_ID[baseCoin];
    if (!coinId) return res.status(400).json({ error: `Unsupported coin: ${baseCoin}` });

    // Fetch current price
    const priceRes = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: { ids: coinId, vs_currencies: 'usd' }
    });
    const currentPrice = priceRes.data[coinId]?.usd;
    if (!currentPrice) return res.status(500).json({ error: 'Could not fetch price.' });

    const networkInfo = blockchain.getNetworkInfo();
    const { ethers } = require('ethers');
    const contractData = blockchain.loadContract('ChainSyncToken');
    if (!contractData) return res.status(503).json({ error: 'Token contract ABI not found.' });

    // Build unsigned transaction data for MetaMask
    const tokenInterface = new ethers.utils.Interface(contractData.abi);
    const tokenAmount = ethers.utils.parseEther(amount.toString());

    let txData;
    if (type === 'buy') {
      // Transfer CST from deployer to user (user signs approval, server mints)
      txData = {
        action: 'mint', // Server will mint tokens to user
        amount: amount.toString(),
        price: currentPrice,
        total: parseFloat(amount) * currentPrice,
        contractAddress: networkInfo.contracts.token,
        chainId: networkInfo.chainId
      };
    } else {
      // Sell: user transfers CST back to deployer
      const deployerWallet = blockchain.getDeployerWallet();
      txData = {
        action: 'transfer',
        to: deployerWallet.address,
        amount: amount.toString(),
        price: currentPrice,
        total: parseFloat(amount) * currentPrice,
        contractAddress: networkInfo.contracts.token,
        chainId: networkInfo.chainId,
        encodedData: tokenInterface.encodeFunctionData('transfer', [deployerWallet.address, tokenAmount])
      };
    }

    res.json(txData);
  } catch (error) {
    console.error('Trade prepare error:', error);
    res.status(500).json({ error: 'Failed to prepare trade.' });
  }
});

/**
 * POST /api/trade/confirm-tx
 * Confirm an on-chain trade by recording the txHash
 */
router.post('/confirm-tx', auth, async (req, res) => {
  try {
    const { pair, type, amount, price, total, txHash } = req.body;

    if (!txHash) return res.status(400).json({ error: 'txHash is required.' });

    // If buy: server mints tokens to user's wallet
    if (type === 'buy' && blockchain.isBlockchainEnabled()) {
      try {
        const mintResult = await blockchain.mintTokens(req.user.walletAddress, parseFloat(amount));
        req.body.mintTxHash = mintResult.txHash;
      } catch (mintErr) {
        console.error('Mint error during buy confirm:', mintErr.message);
        // Continue — record trade even if mint fails
      }
    }

    const trade = new Trade({
      userId: req.user.userId,
      pair: pair.toUpperCase(),
      type,
      orderType: 'market',
      amount: parseFloat(amount),
      price: parseFloat(price),
      total: parseFloat(total),
      txHash,
      isBot: false
    });

    await trade.save();

    // Update portfolio
    const baseCoin = pair.split('/')[0].toUpperCase().trim();
    if (type === 'buy') {
      const existing = await Portfolio.findOne({ userId: req.user.userId, coinSymbol: baseCoin });
      if (existing) {
        const totalAmount = existing.amount + parseFloat(amount);
        existing.buyPrice = ((existing.amount * existing.buyPrice) + (parseFloat(amount) * parseFloat(price))) / totalAmount;
        existing.amount = totalAmount;
        await existing.save();
      } else {
        await new Portfolio({ userId: req.user.userId, coinSymbol: baseCoin, amount: parseFloat(amount), buyPrice: parseFloat(price), source: 'trade' }).save();
      }
    } else if (type === 'sell') {
      const existing = await Portfolio.findOne({ userId: req.user.userId, coinSymbol: baseCoin });
      if (existing) {
        existing.amount -= parseFloat(amount);
        if (existing.amount <= 0) await Portfolio.deleteOne({ _id: existing._id });
        else await existing.save();
      }
    }

    res.status(201).json({
      trade,
      message: `On-chain ${type.toUpperCase()}: ${amount} CST @ $${parseFloat(price).toLocaleString()} | Tx: ${txHash.substring(0, 10)}...`
    });
  } catch (error) {
    console.error('Trade confirm error:', error);
    res.status(500).json({ error: 'Failed to confirm trade.' });
  }
});

module.exports = router;
