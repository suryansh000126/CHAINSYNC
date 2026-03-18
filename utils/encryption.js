const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const PBKDF2_ITERATIONS = 100000;
const DIGEST = 'sha256';

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
}

/**
 * Encrypt plaintext using AES-256-GCM with PBKDF2 key derivation
 * @param {string} plaintext - The text to encrypt
 * @param {string} password - The user's password for key derivation
 * @returns {object} - { encryptedData, salt, iv, authTag } all as hex strings
 */
function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt data encrypted with the encrypt function
 * @param {string} encryptedData - Hex-encoded encrypted data
 * @param {string} password - The user's password
 * @param {string} saltHex - Hex-encoded salt
 * @param {string} ivHex - Hex-encoded IV
 * @param {string} authTagHex - Hex-encoded auth tag
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedData, password, saltHex, ivHex, authTagHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
