const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Portfolio = require('../models/Portfolio');
const axios = require('axios');

/**
 * GET /api/portfolio
 * Get all holdings for authenticated user with live prices
 */
router.get('/', auth, async (req, res) => {
  try {
    let holdings = [];
    
    try {
      holdings = await Portfolio.find({ userId: req.user.userId });
    } catch (dbError) {
      console.warn('DB Error in portfolio, providing dummy data if Admin');
      if (req.user.walletAddress === '0xadmin') {
        // High-value dummy wallet for the Admin/User
        holdings = [
          { _id: 'h1', coinSymbol: 'BTC', amount: 5.42, buyPrice: 42000, source: 'dummy' },
          { _id: 'h2', coinSymbol: 'ETH', amount: 124.8, buyPrice: 2100, source: 'dummy' },
          { _id: 'h3', coinSymbol: 'SOL', amount: 1540, buyPrice: 95, source: 'dummy' },
          { _id: 'h4', coinSymbol: 'DOGE', amount: 500000, buyPrice: 0.12, source: 'dummy' },
          { _id: 'h5', coinSymbol: 'PEPE', amount: 1000000000, buyPrice: 0.000008, source: 'dummy' }
        ];
      } else {
        return res.json({ holdings: [], summary: { totalValue: 0, totalInvested: 0, totalPnl: 0, totalPnlPercent: 0, assetCount: 0 } });
      }
    }

    // [Bypass for Admin even if DB is UP to ensure they get the "Dummy Wallet" requested]
    if (req.user.walletAddress === '0xadmin' && (holdings.length === 0 || holdings[0].source === 'dummy')) {
        holdings = [
          { _id: 'h1', coinSymbol: 'BTC', amount: 5.42, buyPrice: 42000, source: 'dummy' },
          { _id: 'h2', coinSymbol: 'ETH', amount: 124.8, buyPrice: 2100, source: 'dummy' },
          { _id: 'h3', coinSymbol: 'SOL', amount: 1540, buyPrice: 95, source: 'dummy' },
          { _id: 'h4', coinSymbol: 'DOGE', amount: 500000, buyPrice: 0.12, source: 'dummy' },
          { _id: 'h5', coinSymbol: 'PEPE', amount: 1000000000, buyPrice: 0.000008, source: 'dummy' }
        ];
    }

    // Fetch live prices for all unique coins
    const uniqueCoins = [...new Set(holdings.map(h => h.coinSymbol.toLowerCase()))];
    // ... rest of the original logic for price enrichment
    let prices = {};
    if (uniqueCoins.length > 0) {
      try {
        const coinIds = await getCoinGeckoIds(uniqueCoins);
        const idsParam = Object.values(coinIds).join(',');
        if (idsParam) {
          const priceRes = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true`,
            { timeout: 5000 }
          );
          for (const [symbol, id] of Object.entries(coinIds)) {
            if (priceRes.data[id]) {
              prices[symbol.toUpperCase()] = {
                usd: priceRes.data[id].usd,
                change24h: priceRes.data[id].usd_24h_change || 0
              };
            }
          }
        }
      } catch (e) {
        console.error('Price fetch error:', e.message);
      }
    }

    // Enrich holdings with prices
    const enrichedHoldings = holdings.map(h => {
      const priceData = prices[h.coinSymbol] || { usd: 0, change24h: 0 };
      const currentValue = h.amount * priceData.usd;
      const investedValue = h.amount * h.buyPrice;
      const pnl = currentValue - investedValue;
      const pnlPercent = investedValue > 0 ? ((pnl / investedValue) * 100) : 0;

      return {
        _id: h._id,
        coinSymbol: h.coinSymbol,
        amount: h.amount,
        buyPrice: h.buyPrice,
        currentPrice: priceData.usd,
        change24h: priceData.change24h,
        currentValue,
        pnl,
        pnlPercent,
        source: h.source,
        addedAt: h.addedAt
      };
    });

    const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalInvested = enrichedHoldings.reduce((sum, h) => sum + (h.amount * h.buyPrice), 0);
    const totalPnl = totalValue - totalInvested;

    res.json({
      holdings: enrichedHoldings,
      summary: {
        totalValue,
        totalInvested,
        totalPnl,
        totalPnlPercent: totalInvested > 0 ? ((totalPnl / totalInvested) * 100) : 0,
        assetCount: holdings.length
      }
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio.' });
  }
});

/**
 * POST /api/portfolio
 * Add a new holding
 */
router.post('/', auth, async (req, res) => {
  try {
    const { coinSymbol, amount, buyPrice, source } = req.body;

    if (!coinSymbol || !amount) {
      return res.status(400).json({ error: 'coinSymbol and amount are required.' });
    }

    const holding = new Portfolio({
      userId: req.user.userId,
      coinSymbol: coinSymbol.toUpperCase(),
      amount: parseFloat(amount),
      buyPrice: parseFloat(buyPrice) || 0,
      source: source || 'manual'
    });

    await holding.save();
    res.status(201).json(holding);
  } catch (error) {
    console.error('Add holding error:', error);
    res.status(500).json({ error: 'Failed to add holding.' });
  }
});

/**
 * DELETE /api/portfolio/:id
 * Remove a holding
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const holding = await Portfolio.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found.' });
    }

    res.json({ message: 'Holding removed.', holding });
  } catch (error) {
    console.error('Delete holding error:', error);
    res.status(500).json({ error: 'Failed to delete holding.' });
  }
});

// Helper: Map coin symbols to CoinGecko IDs
const SYMBOL_TO_ID = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin',
  ada: 'cardano', xrp: 'ripple', dot: 'polkadot', matic: 'matic-network',
  avax: 'avalanche-2', link: 'chainlink', uni: 'uniswap', ltc: 'litecoin',
  bch: 'bitcoin-cash', atom: 'cosmos', near: 'near', algo: 'algorand',
  xmr: 'monero', bnb: 'binancecoin', trx: 'tron', shib: 'shiba-inu',
  pi: 'pi-network', apt: 'aptos', arb: 'arbitrum', op: 'optimism',
  sui: 'sui', sei: 'sei-network', pepe: 'pepe', wif: 'dogwifcoin'
};

async function getCoinGeckoIds(symbols) {
  const result = {};
  for (const sym of symbols) {
    const s = sym.toLowerCase();
    if (SYMBOL_TO_ID[s]) {
      result[s] = SYMBOL_TO_ID[s];
    }
  }
  return result;
}

module.exports = router;
