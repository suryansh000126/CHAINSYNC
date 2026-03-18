/**
 * ChainSync — Blockchain API Routes
 * Provides on-chain balance checks, transaction status, and network info.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const blockchain = require('../utils/blockchain');

/**
 * GET /api/blockchain/network
 * Returns contract addresses and network config for frontend
 */
router.get('/network', (req, res) => {
  res.json(blockchain.getNetworkInfo());
});

/**
 * GET /api/blockchain/balance/:address
 * Returns ETH + CST balance for an address
 */
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!address || address.length < 10) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const balances = await blockchain.getWalletBalance(address);
    res.json(balances);
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({ error: 'Failed to fetch balance.' });
  }
});

/**
 * GET /api/blockchain/tx/:txHash
 * Returns transaction receipt/status
 */
router.get('/tx/:txHash', async (req, res) => {
  try {
    const provider = blockchain.getProvider();
    if (!provider) {
      return res.status(503).json({ error: 'Blockchain not configured.' });
    }

    const receipt = await provider.getTransactionReceipt(req.params.txHash);
    if (!receipt) {
      return res.json({ status: 'pending', txHash: req.params.txHash });
    }

    res.json({
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      from: receipt.from,
      to: receipt.to
    });
  } catch (error) {
    console.error('TX status error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction.' });
  }
});

/**
 * GET /api/blockchain/token-abi
 * Returns the token ABI for frontend contract interaction
 */
router.get('/token-abi', (req, res) => {
  const data = blockchain.loadContract('ChainSyncToken');
  if (!data) return res.status(404).json({ error: 'Token ABI not found. Deploy contracts first.' });
  res.json(data);
});

/**
 * GET /api/blockchain/nft-abi
 * Returns the NFT ABI for frontend contract interaction
 */
router.get('/nft-abi', (req, res) => {
  const data = blockchain.loadContract('ChainSyncNFT');
  if (!data) return res.status(404).json({ error: 'NFT ABI not found. Deploy contracts first.' });
  res.json(data);
});

module.exports = router;
