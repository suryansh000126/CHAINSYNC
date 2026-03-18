const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const SeedVault = require('../models/SeedVault');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * POST /api/vault/store
 * Encrypt and store seed phrase
 * Body: { seedPhrase, password }
 */
router.post('/store', auth, async (req, res) => {
  try {
    const { seedPhrase, password } = req.body;

    if (!seedPhrase || !password) {
      return res.status(400).json({ error: 'seedPhrase and password are required.' });
    }

    // Validate seed phrase (12 or 24 words)
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return res.status(400).json({ error: 'Seed phrase must be 12 or 24 words.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Encrypt the seed phrase
    const encrypted = encrypt(seedPhrase.trim(), password);

    // Upsert vault (one per user)
    await SeedVault.findOneAndUpdate(
      { userId: req.user.userId },
      {
        userId: req.user.userId,
        encryptedData: encrypted.encryptedData,
        salt: encrypted.salt,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Seed phrase encrypted and stored securely.', wordCount: words.length });
  } catch (error) {
    console.error('Vault store error:', error);
    res.status(500).json({ error: 'Failed to store seed phrase.' });
  }
});

/**
 * POST /api/vault/retrieve
 * Decrypt and return seed phrase
 * Body: { password }
 */
router.post('/retrieve', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const vault = await SeedVault.findOne({ userId: req.user.userId });

    if (!vault) {
      return res.status(404).json({ error: 'No seed phrase stored. Store one first.' });
    }

    try {
      const decrypted = decrypt(
        vault.encryptedData,
        password,
        vault.salt,
        vault.iv,
        vault.authTag
      );

      res.json({ seedPhrase: decrypted });
    } catch (decryptError) {
      return res.status(401).json({ error: 'Incorrect password. Cannot decrypt seed phrase.' });
    }
  } catch (error) {
    console.error('Vault retrieve error:', error);
    res.status(500).json({ error: 'Failed to retrieve seed phrase.' });
  }
});

/**
 * GET /api/vault/status
 * Check if user has a stored vault (no data exposed)
 */
router.get('/status', auth, async (req, res) => {
  try {
    const vault = await SeedVault.findOne({ userId: req.user.userId });
    res.json({
      hasVault: !!vault,
      updatedAt: vault ? vault.updatedAt : null
    });
  } catch (error) {
    console.error('Vault status error:', error);
    res.status(500).json({ error: 'Failed to check vault status.' });
  }
});

/**
 * DELETE /api/vault
 * Delete the stored vault
 * Body: { password } (must verify before deletion)
 */
router.delete('/', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete vault.' });
    }

    const vault = await SeedVault.findOne({ userId: req.user.userId });
    if (!vault) {
      return res.status(404).json({ error: 'No vault found.' });
    }

    // Verify password first
    try {
      decrypt(vault.encryptedData, password, vault.salt, vault.iv, vault.authTag);
    } catch (e) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    await SeedVault.deleteOne({ userId: req.user.userId });
    res.json({ message: 'Vault deleted successfully.' });
  } catch (error) {
    console.error('Vault delete error:', error);
    res.status(500).json({ error: 'Failed to delete vault.' });
  }
});

module.exports = router;
