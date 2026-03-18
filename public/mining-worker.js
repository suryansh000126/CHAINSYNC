/**
 * Mining Web Worker
 * Performs SHA-256 hash computation in a separate thread
 * Communicates with main thread via postMessage
 */

let mining = false;
let hashCount = 0;
let startTime = 0;
let difficulty = 4; // Number of leading zeros required
let nonce = 0;
let blockData = '';
let sessionId = '';

// Listen for commands from main thread
self.onmessage = function(e) {
  const { command, data } = e.data;

  switch (command) {
    case 'start':
      difficulty = data.difficulty || 4;
      blockData = data.blockData || generateBlockData();
      sessionId = data.sessionId || '';
      mining = true;
      hashCount = 0;
      nonce = 0;
      startTime = Date.now();
      mine();
      break;

    case 'stop':
      mining = false;
      self.postMessage({
        type: 'stopped',
        hashCount,
        elapsed: Date.now() - startTime,
        hashrate: calculateHashrate()
      });
      break;

    case 'update_difficulty':
      difficulty = data.difficulty;
      break;
  }
};

/**
 * Main mining loop
 * Runs in batches to allow message processing
 */
async function mine() {
  const BATCH_SIZE = 5000; // Hashes per batch
  const REPORT_INTERVAL = 2000; // Report stats every 2 seconds
  let lastReport = Date.now();

  while (mining) {
    for (let i = 0; i < BATCH_SIZE && mining; i++) {
      const hash = await computeHash(blockData + nonce);
      hashCount++;
      nonce++;

      // Check if hash meets difficulty (starts with N zeros)
      if (meetsTarget(hash, difficulty)) {
        self.postMessage({
          type: 'share_found',
          hash,
          nonce: nonce - 1,
          hashCount,
          hashrate: calculateHashrate(),
          sessionId
        });

        // Generate new block data after finding a share
        blockData = generateBlockData();
        nonce = 0;
      }
    }

    // Report stats periodically
    const now = Date.now();
    if (now - lastReport >= REPORT_INTERVAL) {
      self.postMessage({
        type: 'stats',
        hashCount,
        hashrate: calculateHashrate(),
        elapsed: now - startTime,
        nonce
      });
      lastReport = now;
    }

    // Yield to message processing
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * SHA-256 hash computation using SubtleCrypto
 */
async function computeHash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if hash meets the difficulty target
 */
function meetsTarget(hash, diff) {
  for (let i = 0; i < diff; i++) {
    if (hash[i] !== '0') return false;
  }
  return true;
}

/**
 * Calculate current hashrate (hashes per second)
 */
function calculateHashrate() {
  const elapsed = (Date.now() - startTime) / 1000;
  return elapsed > 0 ? Math.round(hashCount / elapsed) : 0;
}

/**
 * Generate random block data to hash against
 */
function generateBlockData() {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result + ':' + Date.now() + ':';
}
