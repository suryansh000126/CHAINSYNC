const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const NFT = require('../models/NFT');
const blockchain = require('../utils/blockchain');

// Curated NFT collection data (seed data for the marketplace)
const SEED_NFTS = [
  { tokenId: 'cs-001', name: 'Cyber Genesis', collectionName: 'ChainSync Origins', image: 'https://picsum.photos/seed/nft1/400/400', description: 'The first block in the ChainSync metaverse.', price: 0.5, currency: 'ETH', isListed: true },
  { tokenId: 'cs-002', name: 'Neural Phantom', collectionName: 'ChainSync Origins', image: 'https://picsum.photos/seed/nft2/400/400', description: 'A ghostly neural entity roaming the blockchain.', price: 0.8, currency: 'ETH', isListed: true },
  { tokenId: 'cs-003', name: 'Quantum Ape', collectionName: 'Crypto Beasts', image: 'https://picsum.photos/seed/nft3/400/400', description: 'An ape that mastered quantum computing.', price: 1.2, currency: 'ETH', isListed: true },
  { tokenId: 'cs-004', name: 'Void Walker', collectionName: 'ChainSync Origins', image: 'https://picsum.photos/seed/nft4/400/400', description: 'Walking through the digital void.', price: 0.35, currency: 'ETH', isListed: true },
  { tokenId: 'cs-005', name: 'Neon Serpent', collectionName: 'Crypto Beasts', image: 'https://picsum.photos/seed/nft5/400/400', description: 'A serpent made of pure neon energy.', price: 0.65, currency: 'ETH', isListed: true },
  { tokenId: 'cs-012', name: 'Binary Ghost', collectionName: 'ChainSync Origins', image: 'https://picsum.photos/seed/nft12/400/400', description: 'A spirit made of ones and zeros.', price: 0.15, currency: 'ETH', isListed: true },
  { tokenId: 'cs-006', name: 'Diamond Skull', collectionName: 'Rare Gems', image: 'https://picsum.photos/seed/nft6/400/400', description: 'A skull carved from blockchain diamonds.', price: 2.0, currency: 'ETH' },
  { tokenId: 'cs-007', name: 'Matrix Orchid', collectionName: 'Digital Flora', image: 'https://picsum.photos/seed/nft7/400/400', description: 'A delicate flower growing in the matrix.', price: 0.25, currency: 'ETH' },
  { tokenId: 'cs-008', name: 'Pixel Samurai', collectionName: 'Warriors', image: 'https://picsum.photos/seed/nft8/400/400', description: 'An 8-bit warrior from the blockchain realm.', price: 1.5, currency: 'ETH' },
  { tokenId: 'cs-009', name: 'Glitch Cat', collectionName: 'Crypto Beasts', image: 'https://picsum.photos/seed/nft9/400/400', description: 'A cat that lives between dimensions.', price: 0.4, currency: 'ETH' },
  { tokenId: 'cs-010', name: 'Holographic Phoenix', collectionName: 'Rare Gems', image: 'https://picsum.photos/seed/nft10/400/400', description: 'A phoenix reborn from holographic ashes.', price: 3.0, currency: 'ETH' },
  { tokenId: 'cs-011', name: 'Crypto Punk #7291', collectionName: 'Punks Remix', image: 'https://picsum.photos/seed/nft11/400/400', description: 'A reimagined classic punk.', price: 5.0, currency: 'ETH' }
];

/**
 * POST /api/nfts/seed
 * Seed the NFT collection (run once)
 */
router.post('/seed', async (req, res) => {
  try {
    const existing = await NFT.countDocuments();
    if (existing > 0) {
      return res.json({ message: `Already seeded with ${existing} NFTs.` });
    }

    await NFT.insertMany(SEED_NFTS);
    res.json({ message: `Seeded ${SEED_NFTS.length} NFTs.` });
  } catch (error) {
    console.error('NFT seed error:', error);
    res.status(500).json({ error: 'Failed to seed NFTs.' });
  }
});

/**
 * GET /api/nfts/trending
 * Get live listed NFTs from Reservoir/OpenSea
 */
router.get('/trending', async (req, res) => {
  try {
    const axios = require('axios');
    const { collection } = req.query;
    
    // Attempt 1: Reservoir API (Public-friendly trending collections)
    try {
      const resp = await axios.get('https://api.reservoir.tools/collections/v5?limit=12&sortBy=allTimeVolume', {
        headers: { 'Accept': '*/*' },
        timeout: 4000
      });
      
      if (resp.data.collections && resp.data.collections.length > 0) {
        const liveNfts = resp.data.collections.map(coll => ({
          _id: coll.id,
          tokenId: 'multi',
          name: coll.name,
          collectionName: coll.name,
          image: coll.image || (coll.sampleImages && coll.sampleImages[0]) || 'https://picsum.photos/seed/' + coll.id + '/400/400',
          description: coll.description || 'Live collection from Reservoir.',
          price: coll.floorAsk?.price?.amount?.decimal?.toFixed(2) || (Math.random() * 1.5 + 0.1).toFixed(2),
          currency: 'ETH',
          isListed: true
        }));

        return res.json({
          nfts: liveNfts,
          collections: [...new Set(liveNfts.map(n => n.collectionName))],
          total: liveNfts.length,
          source: 'Reservoir',
          isLive: true
        });
      }
    } catch (err) {
      console.warn('Reservoir API failed, trying OpenSea...');
    }

    // Attempt 2: OpenSea API (requires key for many endpoints, but we'll try)
    try {
      const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY; 
      const headers = OPENSEA_API_KEY ? { 'X-API-KEY': OPENSEA_API_KEY } : {};
      
      const response = await axios.get('https://api.opensea.io/api/v2/collections?limit=12', { 
        headers,
        timeout: 3000
      });
      
      if (response.data.collections) {
        const liveNfts = response.data.collections.map(coll => ({
          _id: coll.collection,
          tokenId: 'multi',
          name: coll.name,
          collectionName: coll.name,
          image: coll.image_url || 'https://picsum.photos/seed/' + coll.collection + '/400/400',
          description: coll.description || 'Live collection from OpenSea.',
          price: (Math.random() * 2).toFixed(2),
          currency: 'ETH',
          isListed: true
        }));

        return res.json({
          nfts: liveNfts,
          collections: [...new Set(liveNfts.map(n => n.collectionName))],
          total: liveNfts.length,
          source: 'OpenSea',
          isLive: true
        });
      }
    } catch (apiError) {
      console.warn('OpenSea API Error, falling back to seed data');
      
      // Fallback to local static data if API or Database fails
      let nfts = SEED_NFTS;
      if (collection) nfts = nfts.filter(n => n.collectionName === collection);
      
      const collections = [...new Set(SEED_NFTS.map(n => n.collectionName))];
      
      return res.json({
        nfts,
        collections,
        total: nfts.length,
        isLive: false,
        warning: 'Showing curated collection'
      });
    }
  } catch (error) {
    console.error('NFT fetch overall error:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs.' });
  }
});

/**
 * POST /api/nfts/mint
 * Mint a new on-chain NFT
 */
router.post('/mint', auth, async (req, res) => {
  try {
    const { name, description, image, collectionName, price } = req.body;

    if (!blockchain.isBlockchainEnabled()) {
      return res.status(503).json({ error: 'Blockchain not configured.' });
    }

    if (!req.user.walletAddress || req.user.walletAddress === '0xadmin') {
      return res.status(400).json({ error: 'Real wallet required to mint on-chain NFTs.' });
    }

    // Dummy metadata URI for demo
    const tokenURI = `ipfs://demo-metadata-${Date.now()}`;

    // Mint on-chain using server wallet (for demo simplicity, normally user signs this too, but we will mint it TO them)
    const mintResult = await blockchain.mintNFT(req.user.walletAddress, tokenURI);

    const nft = new NFT({
      tokenId: mintResult.tokenId || `tx-${mintResult.txHash.substring(0, 10)}`,
      name,
      collectionName: collectionName || 'User Minted',
      image,
      description,
      price: parseFloat(price) || 0.1,
      currency: 'ETH',
      ownerId: req.user.userId,
      isListed: false,
      onChain: true,
      txHash: mintResult.txHash
    });

    await nft.save();

    res.status(201).json({
      message: `Successfully minted "${name}" on Sepolia!`,
      nft,
      txHash: mintResult.txHash
    });
  } catch (error) {
    console.error('NFT mint error:', error);
    res.status(500).json({ error: 'Failed to mint NFT.' });
  }
});

/**
 * POST /api/nfts/buy/prepare
 * Prepare an on-chain NFT purchase for MetaMask signing
 */
router.post('/buy/prepare', auth, async (req, res) => {
  try {
    const { nftId } = req.body;

    const nft = await NFT.findById(nftId);
    if (!nft) return res.status(404).json({ error: 'NFT not found.' });
    if (!nft.isListed) return res.status(400).json({ error: 'This NFT is not currently listed for sale.' });
    if (nft.ownerId && nft.ownerId.toString() === req.user.userId) return res.status(400).json({ error: 'You already own this NFT.' });

    // Ensure it's an on-chain NFT, else fallback to off-chain DB buy
    if (!nft.onChain || !blockchain.isBlockchainEnabled()) {
      return res.json({ action: 'database_only', nft });
    }

    const networkInfo = blockchain.getNetworkInfo();
    const { ethers } = require('ethers');
    const contractData = blockchain.loadContract('ChainSyncNFT');
    if (!contractData) return res.status(503).json({ error: 'NFT contract ABI not found.' });

    const nftInterface = new ethers.utils.Interface(contractData.abi);

    // Prepare transferFrom(seller, buyer, tokenId)
    // NOTE: seller must have called setApprovalForAll or approve.
    // In this demo, if the server minted it initially, we might need a workaround, but we'll assume standard ERC721 flow where owner signs.
    // For simplicity since the app owns the demo NFTs, we transfer from server wallet.
    const sellerAddress = blockchain.getDeployerWallet().address; // Mocking seller as deployer

    const txData = {
      action: 'transfer_nft',
      to: networkInfo.contracts.nft,
      contractAddress: networkInfo.contracts.nft,
      chainId: networkInfo.chainId,
      price: nft.price,
      encodedData: nftInterface.encodeFunctionData('transferFrom', [sellerAddress, req.user.walletAddress, nft.tokenId])
    };

    res.json(txData);
  } catch (error) {
    console.error('NFT prepare buy error:', error);
    res.status(500).json({ error: 'Failed to prepare NFT purchase.' });
  }
});

/**
 * POST /api/nfts/buy/confirm-tx
 * Confirm an NFT purchase
 */
router.post('/buy/confirm-tx', auth, async (req, res) => {
  try {
    const { nftId, txHash } = req.body;

    const nft = await NFT.findById(nftId);
    if (!nft) return res.status(404).json({ error: 'NFT not found.' });

    // Record previous owner
    if (nft.ownerId) {
      nft.previousOwners.push({
        userId: nft.ownerId,
        purchasedAt: new Date(),
        price: nft.price
      });
    }

    nft.ownerId = req.user.userId;
    nft.isListed = false;
    if (txHash) nft.txHash = txHash;
    
    await nft.save();

    res.json({
      message: `Successfully purchased "${nft.name}"!`,
      nft
    });
  } catch (error) {
    console.error('NFT confirm buy error:', error);
    res.status(500).json({ error: 'Failed to confirm NFT buy.' });
  }
});

/**
 * POST /api/nfts/list
 * List an owned NFT for sale
 */
router.post('/list', auth, async (req, res) => {
  try {
    const { nftId, price } = req.body;

    const nft = await NFT.findOne({
      _id: nftId,
      ownerId: req.user.userId
    });

    if (!nft) {
      return res.status(404).json({ error: 'NFT not found or you don\'t own it.' });
    }

    nft.isListed = true;
    nft.price = parseFloat(price) || nft.price;
    await nft.save();

    res.json({ message: `"${nft.name}" listed for ${nft.price} ${nft.currency}.`, nft });
  } catch (error) {
    console.error('NFT list error:', error);
    res.status(500).json({ error: 'Failed to list NFT.' });
  }
});

/**
 * GET /api/nfts/owned
 * Get user's owned NFTs
 */
router.get('/owned', auth, async (req, res) => {
  try {
    const nfts = await NFT.find({ ownerId: req.user.userId });
    res.json(nfts);
  } catch (error) {
    console.error('Owned NFTs error:', error);
    res.status(500).json({ error: 'Failed to fetch owned NFTs.' });
  }
});

module.exports = router;
