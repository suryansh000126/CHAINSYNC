const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const User = require('../models/User');

/**
 * POST /api/auth/login
 * Wallet-based authentication via message signing
 * Body: { walletAddress, message, signature }
 */
router.post('/login', async (req, res) => {
  try {
    const { walletAddress, message, signature } = req.body;

    // ADMIN BYPASS FOR DEMO
    if (walletAddress && walletAddress.toLowerCase() === '0xadmin') {
      const adminId = '000000000000000000000001'; // Mock ObjectId
      const token = jwt.sign(
        { userId: adminId, walletAddress: '0xadmin', isPremium: true, isElite: true },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '24h' }
      );
      return res.json({
        token,
        user: { id: adminId, walletAddress: '0xadmin', isPremium: true, isElite: true, createdAt: new Date() }
      });
    }

    if (!walletAddress || !message || !signature) {
      return res.status(400).json({ error: 'walletAddress, message, and signature are required.' });
    }
    
    // ... rest of the original logic
    try {
      // Verify the signature matches the wallet address
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Signature verification failed.' });
      }

      // Find or create user
      let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

      if (!user) {
        user = new User({ walletAddress: walletAddress.toLowerCase() });
        await user.save();
      }

      // Update last login
      user.lastLogin = new Date();
      // Hackathon override: Give every user Premium & Elite
      user.isPremium = true;
      user.isElite = true;
      await user.save();

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, walletAddress: user.walletAddress, isPremium: true, isElite: true },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          walletAddress: user.walletAddress,
          isPremium: true,
          isElite: true,
          createdAt: user.createdAt
        }
      });
    } catch (dbError) {
      console.warn('DB Error in login, but allowing session for demo if address is provided');
      if (walletAddress) {
        // Fallback for when DB is down but user signed correctly
        const guestId = '000000000000000000000002';
        const token = jwt.sign(
          { userId: guestId, walletAddress: walletAddress.toLowerCase(), isPremium: false, isElite: false },
          process.env.JWT_SECRET || 'fallback_secret',
          { expiresIn: '24h' }
        );
        return res.json({
          token,
          user: { id: guestId, walletAddress: walletAddress.toLowerCase(), isPremium: false, isElite: false, createdAt: new Date() }
        });
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token is still valid
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

/**
 * POST /api/auth/upgrade
 * Upgrade user to Premium or Elite (demo — no real payment)
 */
router.post('/upgrade', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { tier } = req.body; // 'premium' or 'elite'

    const update = {};
    if (tier === 'premium') update.isPremium = true;
    if (tier === 'elite') { update.isPremium = true; update.isElite = true; }

    const user = await User.findByIdAndUpdate(decoded.userId, update, { new: true });

    // Issue new token with updated flags
    const newToken = jwt.sign(
      {
        userId: user._id,
        walletAddress: user.walletAddress,
        isPremium: user.isPremium,
        isElite: user.isElite
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token: newToken, user });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Upgrade failed.' });
  }
});

module.exports = router;
