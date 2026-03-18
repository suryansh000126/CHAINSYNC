/**
 * ChainSync — Frontend Application Logic
 * Handles all API calls, WebSocket price streaming, mining worker, and UI rendering
 */

// ===== CONFIG =====
const API_BASE = '';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let miningWorker = null;
let miningSessionId = null;
let miningStartTime = null;
let miningTimer = null;
let botInterval = null;
let priceWs = null;
let livePrices = {};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initWebSocket();
  showSection('dashboard');
  // Load live prices immediately — no auth required
  fetchPricesREST();
});

// ===== AUTH =====
function checkAuth() {
  if (!authToken || !currentUser) {
    // Allow browsing without auth but show limited features
    updateWalletBadge(null);
    return;
  }

  // Verify token
  apiCall('/api/auth/verify').then(res => {
    if (res && res.valid) {
      updateWalletBadge(currentUser.walletAddress);
      checkTierStatus(); // Update Premium/Elite UI locks
      loadDashboard();
    } else {
      clearAuth();
    }
  }).catch(() => clearAuth());
}

function updateWalletBadge(address) {
  const badge = document.getElementById('walletShort');
  if (address) {
    badge.textContent = address.substring(0, 6) + '...' + address.substring(address.length - 4);
  } else {
    badge.textContent = 'Not Connected';
  }
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
}

// ===== API HELPER =====
async function apiCall(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const response = await fetch(API_BASE + url, {
      ...options,
      headers: { ...headers, ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (error) {
    console.error(`API Error (${url}):`, error);
    throw error;
  }
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ===== NAVIGATION =====
function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.remove('active');
  });

  // Deactivate all nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target section
  const target = document.getElementById(`section-${section}`);
  if (target) {
    target.classList.add('active');
  }

  // Activate nav item
  const navBtn = document.getElementById(`nav-${section}`);
  if (navBtn) navBtn.classList.add('active');

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  // Load section-specific data
  switch (section) {
    case 'dashboard': loadDashboard(); break;
    case 'vault': checkVaultStatus(); break;
    case 'trading': loadTradeHistory(); break;
    case 'mining': loadMiningHistory(); break;
    case 'nft': fetchNFTs(); break;
    case 'ai': break;
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== WEBSOCKET PRICE STREAMING =====
function initWebSocket() {
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${location.host}/ws/prices`;

  try {
    priceWs = new WebSocket(wsUrl);

    priceWs.onopen = () => {
      console.log('✅ Price WebSocket connected');
    };

    priceWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'price_snapshot') {
        livePrices = msg.data;
        updateTickerTape();
        updateLivePricesGrid();
      } else if (msg.type === 'price_update') {
        livePrices[msg.data.symbol] = msg.data;
        updateTickerTape();
        updateLivePricesGrid();
      }
    };

    priceWs.onclose = () => {
      console.log('⚠️ Price WebSocket closed. Reconnecting in 5s...');
      setTimeout(initWebSocket, 5000);
    };

    priceWs.onerror = () => {
      console.log('WebSocket error — will use REST fallback');
      fetchPricesREST();
    };
  } catch (e) {
    console.log('WebSocket not available, using REST fallback');
    fetchPricesREST();
  }
}

async function fetchPricesREST() {
  try {
    const data = await apiCall('/api/prices/snapshot');
    livePrices = data;
    updateTickerTape();
    updateLivePricesGrid();
  } catch (e) {
    // Fallback: fetch from trading route
    try {
      const data = await apiCall('/api/trade/prices/live?coins=btc,eth,sol,doge,xrp,ada,bnb,xmr,ltc,dot');
      livePrices = {};
      for (const [symbol, info] of Object.entries(data)) {
        livePrices[symbol] = {
          symbol,
          price: info.price,
          change24h: info.change24h
        };
      }
      updateTickerTape();
      updateLivePricesGrid();
    } catch (e2) {
      console.error('Price fetch failed:', e2);
    }
  }
}

function updateTickerTape() {
  const container = document.getElementById('tickerContent');
  const symbols = Object.keys(livePrices);

  if (symbols.length === 0) return;

  const items = symbols.map(sym => {
    const p = livePrices[sym];
    const change = p.change24h || 0;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    const changeSign = change >= 0 ? '+' : '';
    return `<span class="ticker-item">
      <span class="ticker-symbol">${sym}</span>
      <span class="ticker-price">$${formatPrice(p.price)}</span>
      <span class="ticker-change ${changeClass}">${changeSign}${change.toFixed(2)}%</span>
    </span>`;
  }).join('');

  // Duplicate for seamless scrolling
  container.innerHTML = items + items;
}

function updateLivePricesGrid() {
  const grid = document.getElementById('livePricesGrid');
  if (!grid) return;

  const symbols = Object.keys(livePrices);
  if (symbols.length === 0) return;

  grid.innerHTML = symbols.map(sym => {
    const p = livePrices[sym];
    const change = p.change24h || 0;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    const changeSign = change >= 0 ? '+' : '';
    return `<div class="live-price-row">
      <span class="lp-symbol">${sym}</span>
      <span class="lp-price">$${formatPrice(p.price)}</span>
      <span class="lp-change ${changeClass}">${changeSign}${change.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

function formatPrice(price) {
  if (!price) return '0.00';
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

// ===== DASHBOARD =====
async function loadDashboard() {
  if (!authToken) {
    const emptySummary = { totalValue: 0, totalInvested: 0, totalPnl: 0, totalPnlPercent: 0, assetCount: 0 };
    renderPortfolio({ holdings: [], summary: emptySummary });
    // Show a helpful hint in the holdings area
    const emptyEl = document.getElementById('emptyPortfolio');
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Connect your wallet via the login page to view your portfolio.';
    }
    return;
  }

  try {
    const data = await apiCall('/api/portfolio');
    renderPortfolio(data);
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function renderPortfolio(data) {
  const { holdings, summary } = data;

  // Summary cards
  document.getElementById('totalValue').textContent = `$${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('totalInvested').textContent = `$${summary.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = `${summary.totalPnl >= 0 ? '+' : ''}$${summary.totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  pnlEl.style.color = summary.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)';

  const pnlPercent = document.getElementById('pnlPercent');
  pnlPercent.textContent = `${summary.totalPnlPercent >= 0 ? '+' : ''}${summary.totalPnlPercent.toFixed(2)}%`;
  pnlPercent.className = `summary-change ${summary.totalPnlPercent >= 0 ? 'positive' : 'negative'}`;

  const totalChange = document.getElementById('totalChange');
  totalChange.textContent = `${summary.totalPnlPercent >= 0 ? '+' : ''}${summary.totalPnlPercent.toFixed(2)}%`;
  totalChange.className = `summary-change ${summary.totalPnlPercent >= 0 ? 'positive' : 'negative'}`;

  document.getElementById('assetCount').textContent = summary.assetCount;

  // Holdings table
  const tbody = document.getElementById('holdingsTableBody');
  const emptyText = document.getElementById('emptyPortfolio');

  if (holdings.length === 0) {
    tbody.innerHTML = '';
    emptyText.style.display = 'block';
    return;
  }

  emptyText.style.display = 'none';
  tbody.innerHTML = holdings.map(h => {
    const changeClass = h.change24h >= 0 ? 'positive' : 'negative';
    const pnlClass = h.pnl >= 0 ? 'positive' : 'negative';
    const changeSign = h.change24h >= 0 ? '+' : '';
    const pnlSign = h.pnl >= 0 ? '+' : '';

    return `<tr>
      <td><strong>${h.coinSymbol}</strong> <span style="color:var(--text-muted);font-size:0.75rem;">${h.source}</span></td>
      <td>${h.amount.toFixed(6)}</td>
      <td>$${formatPrice(h.buyPrice)}</td>
      <td>$${formatPrice(h.currentPrice)}</td>
      <td>$${h.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="${pnlClass}">${pnlSign}$${Math.abs(h.pnl).toFixed(2)} (${pnlSign}${h.pnlPercent.toFixed(1)}%)</td>
      <td class="${changeClass}">${changeSign}${h.change24h.toFixed(2)}%</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteHolding('${h._id}')">Remove</button></td>
    </tr>`;
  }).join('');
}

async function addHolding() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const coinSymbol = document.getElementById('addCoinSymbol').value;
  const amount = document.getElementById('addCoinAmount').value;
  const buyPrice = document.getElementById('addCoinPrice').value;

  if (!coinSymbol || coinSymbol === "") {
    showToast('Please select a token.', 'error');
    return;
  }

  if (!amount) {
    showToast('Please enter an amount.', 'error');
    return;
  }

  try {
    await apiCall('/api/portfolio', {
      method: 'POST',
      body: { coinSymbol, amount, buyPrice: buyPrice || 0 }
    });

    showToast(`Added ${amount} ${coinSymbol.toUpperCase()} to portfolio!`, 'success');
    document.getElementById('addCoinSymbol').value = '';
    document.getElementById('addCoinAmount').value = '';
    document.getElementById('addCoinPrice').value = '';
    loadDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteHolding(id) {
  try {
    await apiCall(`/api/portfolio/${id}`, { method: 'DELETE' });
    showToast('Holding removed.', 'info');
    loadDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function checkPrice() {
  const coin = document.getElementById('priceCheckCoin').value;
  const output = document.getElementById('priceOutput');
  output.textContent = 'Fetching...';

  try {
    const data = await apiCall(`/api/trade/prices/live?coins=${coin}`);
    const sym = coin.toUpperCase();
    if (data[sym]) {
      const p = data[sym];
      const change = p.change24h || 0;
      const sign = change >= 0 ? '+' : '';
      output.innerHTML = `<strong>${sym}</strong>: $${formatPrice(p.price)} <span style="color:${change >= 0 ? 'var(--success)' : 'var(--danger)'}">(${sign}${change.toFixed(2)}%)</span>`;
    } else {
      output.textContent = 'Price not available for this coin.';
    }
  } catch (e) {
    output.textContent = 'Failed to fetch price. Check server connection.';
  }
}

// ===== WALLET VAULT =====
async function checkVaultStatus() {
  if (!authToken) return;

  try {
    const data = await apiCall('/api/vault/status');
    const icon = document.getElementById('vaultIcon');
    const text = document.getElementById('vaultStatusText');

    if (data.hasVault) {
      icon.className = 'vault-icon unlocked';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
      text.textContent = `Vault active — last updated ${new Date(data.updatedAt).toLocaleDateString()}`;
    } else {
      icon.className = 'vault-icon locked';
      text.textContent = 'No seed phrase stored yet.';
    }
  } catch (e) {
    document.getElementById('vaultStatusText').textContent = 'Unable to check vault status.';
  }
}

async function storeSeedPhrase() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const seedPhrase = document.getElementById('seedPhraseInput').value.trim();
  const password = document.getElementById('vaultPassword').value;

  if (!seedPhrase || !password) {
    showToast('Enter both seed phrase and password.', 'error');
    return;
  }

  try {
    const data = await apiCall('/api/vault/store', {
      method: 'POST',
      body: { seedPhrase, password }
    });

    showToast(`Seed phrase encrypted & stored (${data.wordCount} words)!`, 'success');
    document.getElementById('seedPhraseInput').value = '';
    document.getElementById('vaultPassword').value = '';
    checkVaultStatus();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function retrieveSeedPhrase() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const password = document.getElementById('retrievePassword').value;
  if (!password) {
    showToast('Enter your decryption password.', 'error');
    return;
  }

  try {
    const data = await apiCall('/api/vault/retrieve', {
      method: 'POST',
      body: { password }
    });

    const words = data.seedPhrase.split(/\s+/);
    const wordsHtml = words.map((w, i) =>
      `<span class="seed-word"><span class="word-num">${i + 1}.</span> ${w}</span>`
    ).join('');

    document.getElementById('seedWords').innerHTML = wordsHtml;
    document.getElementById('seedReveal').style.display = 'block';
    document.getElementById('retrievePassword').value = '';
    showToast('Seed phrase decrypted successfully.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function hideSeed() {
  document.getElementById('seedReveal').style.display = 'none';
  document.getElementById('seedWords').innerHTML = '';
}

// ===== TRADING =====
async function executeTrade(type) {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const pair = document.getElementById('tradePair').value.trim();
  const amount = document.getElementById('tradeAmount').value;
  const orderType = document.getElementById('tradeOrderType').value;

  if (!pair || !amount) {
    showToast('Enter trading pair and amount.', 'error');
    return;
  }

  const resultDiv = document.getElementById('tradeResult');
  resultDiv.className = 'trade-result';
  resultDiv.style.display = 'block';
  resultDiv.textContent = 'Preparing transaction...';

  try {
    // 1. Prepare transaction on backend
    const txData = await apiCall('/api/trade/prepare', {
      method: 'POST',
      body: { pair, type, amount, orderType }
    });

    // 2. Execute on-chain via MetaMask (if applicable)
    let txHash = null;
    if (txData.action === 'transfer' || txData.action === 'mint') {
      resultDiv.textContent = 'Please confirm the transaction in MetaMask...';
      txHash = await executeOnChainTransaction(txData);
      
      if (!txHash) {
        throw new Error('Transaction rejected or failed in MetaMask.');
      }
      resultDiv.textContent = 'Transaction sent! Waiting for confirmation...';
    }

    // 3. Confirm with backend
    const confirmData = await apiCall('/api/trade/confirm-tx', {
      method: 'POST',
      body: { 
        pair, 
        type, 
        amount, 
        price: txData.price, 
        total: txData.total, 
        txHash 
      }
    });

    resultDiv.className = 'trade-result success';
    resultDiv.textContent = confirmData.message;
    showToast(confirmData.message, 'success');
    document.getElementById('tradeAmount').value = '';
    
    // Refresh UI
    loadTradeHistory();
    loadDashboard(); 
    if (typeof fetchOnChainBalances === 'function') fetchOnChainBalances();
  } catch (e) {
    resultDiv.className = 'trade-result error';
    resultDiv.textContent = e.message;
    showToast(e.message, 'error');
  }
}

async function loadTradeHistory() {
  const tbody = document.getElementById('tradeHistoryBody');
  const empty = document.getElementById('emptyTrades');

  if (!authToken) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  try {
    const trades = await apiCall('/api/trade');
    const tbody = document.getElementById('tradeHistoryBody');
    const empty = document.getElementById('emptyTrades');

    if (trades.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = trades.map(t => {
      const typeClass = t.type === 'buy' ? 'positive' : 'negative';
      return `<tr>
        <td>${new Date(t.timestamp).toLocaleString()}</td>
        <td>${t.pair}</td>
        <td class="${typeClass}" style="font-weight:600;text-transform:uppercase;">${t.type}</td>
        <td>${t.amount.toFixed(6)}</td>
        <td>$${formatPrice(t.price)}</td>
        <td>$${t.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td>${t.isBot ? '🤖 Bot' : '👤 Manual'}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Trade history error:', e);
  }
}

// ===== AI PREMIUM =====
async function unlockPremium() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  try {
    const data = await apiCall('/api/auth/upgrade', {
      method: 'POST',
      body: { tier: 'premium' }
    });

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    document.getElementById('premiumLock').classList.add('unlocked');
    document.getElementById('premiumBtn').textContent = '✓ Premium Active';
    document.getElementById('premiumBtn').disabled = true;
    showToast('Premium unlocked! You now have AI analysis access.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function unlockElite() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  try {
    const data = await apiCall('/api/auth/upgrade', {
      method: 'POST',
      body: { tier: 'elite' }
    });

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    document.getElementById('premiumLock').classList.add('unlocked');
    document.getElementById('eliteLock').classList.add('unlocked');
    document.getElementById('premiumBtn').textContent = '✓ Premium Active';
    document.getElementById('premiumBtn').disabled = true;
    document.getElementById('eliteBtn').textContent = '✓ Elite Active';
    document.getElementById('eliteBtn').disabled = true;
    showToast('Elite unlocked! You now have auto-trade bot access.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function fetchAIPicks() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  try {
    const data = await apiCall('/api/trade/prices/ai-picks');
    const grid = document.getElementById('aiPicksGrid');

    grid.innerHTML = data.topPicks.map((coin, i) => {
      const riskClass = coin.risk === 'Low' ? 'risk-low' : coin.risk === 'Medium' ? 'risk-medium' : 'risk-high';
      const changeSign = coin.change24h >= 0 ? '+' : '';

      return `<div class="ai-pick-card">
        <div class="ai-pick-header">
          <img src="${coin.image}" alt="${coin.symbol}" class="ai-pick-img" />
          <div>
            <div class="ai-pick-name">${coin.name}</div>
            <div class="ai-pick-symbol">${coin.symbol}</div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div style="font-size:0.8rem;color:var(--text-muted);">#${i + 1}</div>
          </div>
        </div>
        <div class="ai-pick-score">Score: ${coin.score}</div>
        <div class="ai-pick-meta">
          <span>$${formatPrice(coin.price)}</span>
          <span style="color:${coin.change24h >= 0 ? 'var(--success)' : 'var(--danger)'}">${changeSign}${coin.change24h.toFixed(2)}%</span>
          <span class="${riskClass}">${coin.risk} Risk</span>
          <span>${coin.momentum}</span>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    showToast('Failed to fetch AI picks: ' + e.message, 'error');
  }
}

// ===== AUTO-TRADE BOT =====
function startBot() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const budget = document.getElementById('botBudget').value;
  const risk = document.getElementById('botRisk').value;
  const coins = document.getElementById('botCoins').value.split(',').map(c => c.trim()).filter(Boolean);

  if (!budget || coins.length === 0) {
    showToast('Set budget and target coins.', 'error');
    return;
  }

  document.getElementById('botStartBtn').disabled = true;
  document.getElementById('botStopBtn').disabled = false;
  document.getElementById('botStatus').textContent = 'Bot active — scanning markets...';
  document.getElementById('botStatus').classList.add('active');

  const logBody = document.getElementById('botLogBody');
  logBody.textContent = `[${new Date().toLocaleTimeString()}] Bot started | Budget: $${budget} | Risk: ${risk} | Coins: ${coins.join(', ')}\n`;

  let tradeCount = 0;

  botInterval = setInterval(async () => {
    try {
      // Pick random coin from targets
      const coin = coins[Math.floor(Math.random() * coins.length)];
      const pair = `${coin}/USDT`;

      // Determine action based on risk
      const rand = Math.random();
      let action;
      if (risk === 'conservative') {
        action = 'buy'; // DCA always buys
      } else if (risk === 'balanced') {
        action = rand > 0.45 ? 'buy' : 'sell';
      } else {
        action = rand > 0.55 ? 'buy' : 'sell';
      }

      const amount = (parseFloat(budget) * (0.01 + Math.random() * 0.04)) / (livePrices[coin.toUpperCase()]?.price || 50000);

      const data = await apiCall('/api/trade', {
        method: 'POST',
        body: { pair, type: action, amount: amount.toFixed(6), orderType: 'market', isBot: true }
      });

      tradeCount++;
      logBody.textContent += `[${new Date().toLocaleTimeString()}] ${action.toUpperCase()} ${amount.toFixed(6)} ${coin} @ $${formatPrice(data.trade.price)} | Total: $${data.trade.total.toFixed(2)}\n`;
      logBody.scrollTop = logBody.scrollHeight;

      document.getElementById('botStatus').textContent = `Bot active — ${tradeCount} trades executed`;
    } catch (e) {
      logBody.textContent += `[${new Date().toLocaleTimeString()}] Error: ${e.message}\n`;
    }
  }, 30000); // Every 30 seconds

  showToast('Auto-trade bot started!', 'success');
}

function stopBot() {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }

  document.getElementById('botStartBtn').disabled = false;
  document.getElementById('botStopBtn').disabled = true;
  document.getElementById('botStatus').textContent = 'Bot stopped';
  document.getElementById('botStatus').classList.remove('active');
  document.getElementById('botLogBody').textContent += `[${new Date().toLocaleTimeString()}] Bot stopped by user.\n`;

  showToast('Auto-trade bot stopped.', 'info');
  loadTradeHistory();
  loadDashboard();
}

// ===== MINING =====
async function startMining() {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  const coin = document.getElementById('miningCoin').value;
  const threads = document.getElementById('miningThreads').value;
  const hardwareType = document.querySelector('input[name="miningHardware"]:checked').value;

  try {
    const data = await apiCall('/api/mining/start', {
      method: 'POST',
      body: { coin, threads, hardwareType }
    });

    miningSessionId = data.session._id;
    miningStartTime = Date.now();

    // Show mining UI
    document.getElementById('startMiningBtn').style.display = 'none';
    document.getElementById('stopMiningBtn').style.display = 'block';
    document.getElementById('miningStats').style.display = 'grid';
    document.getElementById('hashScroll').style.display = 'block';
    document.getElementById('miningPulse').style.display = 'block';
    document.getElementById('miningStatusLabel').textContent = 'Mining';
    document.getElementById('miningStatusLabel').style.color = 'var(--success)';

    // Start Web Worker
    miningWorker = new Worker('/mining-worker.js');

    miningWorker.onmessage = async (e) => {
      const msg = e.data;

      if (msg.type === 'stats') {
        document.getElementById('statHashrate').textContent = msg.hashrate + ' H/s';
        updateMiningElapsed();
      }

      if (msg.type === 'share_found') {
        // Add hash to stream
        const stream = document.getElementById('hashStream');
        stream.innerHTML += `<div style="color:var(--success);">✓ Share found: ${msg.hash.substring(0, 32)}... (nonce: ${msg.nonce})</div>`;
        stream.scrollTop = stream.scrollHeight;

        document.getElementById('statHashrate').textContent = msg.hashrate + ' H/s';

        // Submit share to backend
        try {
          const result = await apiCall('/api/mining/submit-share', {
            method: 'POST',
            body: { sessionId: miningSessionId, hashrate: msg.hashrate }
          });

          document.getElementById('statShares').textContent = result.sharesFound;
          document.getElementById('statAccepted').textContent = result.sharesAccepted;
          document.getElementById('statEarnings').textContent = result.earnings.toFixed(8);
        } catch (err) {
          console.error('Share submit error:', err);
        }
      }
    };

    // Start mining with config
    const difficulty = data.config.difficulty;
    miningWorker.postMessage({
      command: 'start',
      data: { difficulty, sessionId: miningSessionId }
    });

    // Elapsed timer
    miningTimer = setInterval(updateMiningElapsed, 1000);

    showToast(`Mining ${coin} started with ${threads} ${hardwareType.toUpperCase()} thread(s)!`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function updateMiningElapsed() {
  if (!miningStartTime) return;
  const elapsed = Date.now() - miningStartTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  document.getElementById('statElapsed').textContent =
    String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

async function stopMining() {
  // Stop worker
  if (miningWorker) {
    miningWorker.postMessage({ command: 'stop' });
    miningWorker.terminate();
    miningWorker = null;
  }

  if (miningTimer) {
    clearInterval(miningTimer);
    miningTimer = null;
  }

  // Tell backend to stop and credit earnings
  try {
    const data = await apiCall('/api/mining/stop', { method: 'POST' });
    showToast(data.message, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }

  // Reset UI
  document.getElementById('startMiningBtn').style.display = 'block';
  document.getElementById('stopMiningBtn').style.display = 'none';
  document.getElementById('miningPulse').style.display = 'none';
  document.getElementById('miningStatusLabel').textContent = 'Offline';
  document.getElementById('miningStatusLabel').style.color = 'var(--text-muted)';

  miningSessionId = null;
  miningStartTime = null;

  loadMiningHistory();
  loadDashboard(); // Refresh portfolio to show mined coins
}

async function loadMiningHistory() {
  const tbody = document.getElementById('miningHistoryBody');
  const empty = document.getElementById('emptyMining');

  if (!authToken) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  try {
    const sessions = await apiCall('/api/mining/history');
    const tbody = document.getElementById('miningHistoryBody');
    const empty = document.getElementById('emptyMining');

    if (sessions.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = sessions.map(s => {
      const duration = s.endTime ? Math.round((new Date(s.endTime) - new Date(s.startTime)) / 60000) : 0;
      return `<tr>
        <td><strong>${s.coin}</strong></td>
        <td>${s.hardwareType.toUpperCase()} × ${s.threads}</td>
        <td>${s.hashrate} H/s</td>
        <td>${s.sharesAccepted}/${s.sharesFound}</td>
        <td style="color:var(--success);">${s.earnings.toFixed(8)} ${s.coin}</td>
        <td>${duration} min</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Mining history error:', e);
  }
}

// ===== NFT MARKETPLACE =====
async function fetchNFTs() {
  try {
    const collection = document.getElementById('nftCollectionFilter').value;
    const sort = document.getElementById('nftSortFilter').value;

    const params = new URLSearchParams();
    if (collection) params.set('collection', collection);
    if (sort) params.set('sort', sort);

    const data = await apiCall(`/api/nfts/trending?${params.toString()}`);

    // Populate collection filter
    const filterSelect = document.getElementById('nftCollectionFilter');
    const currentVal = filterSelect.value;
    if (data.collections && filterSelect.options.length <= 1) {
      data.collections.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = currentVal;
    }

    const grid = document.getElementById('nftGrid');
    if (data.nfts.length === 0) {
      grid.innerHTML = '<p class="empty-text">No NFTs found.</p>';
      return;
    }

    grid.innerHTML = data.nfts.map(nft => `
      <div class="nft-card">
        <img src="${nft.image}" alt="${nft.name}" class="nft-image" loading="lazy" />
        <div class="nft-info">
          <div class="nft-collection">${nft.collectionName}</div>
          <div class="nft-name">${nft.name}</div>
          <div class="nft-price-row">
            <span class="nft-price">${nft.price} ${nft.currency}</span>
            <button class="nft-buy-btn" onclick="buyNFT('${nft._id}')" ${nft.ownerId ? 'disabled' : ''}>
              ${nft.ownerId ? 'Sold' : 'Buy'}
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('nftGrid').innerHTML = '<p class="empty-text">Failed to load NFTs. Start the server first.</p>';
  }
}

async function buyNFT(nftId) {
  if (!authToken) { showToast('Please connect your wallet first.', 'error'); return; }

  try {
    showToast('Preparing NFT purchase...', 'info');

    // 1. Prepare 
    const data = await apiCall('/api/nfts/buy/prepare', {
      method: 'POST',
      body: { nftId }
    });

    let txHash = null;

    // 2. If on-chain, sign with MetaMask
    if (data.action === 'transfer_nft') {
      showToast('Please confirm the NFT transfer in MetaMask...', 'info');
      txHash = await executeOnChainTransaction(data);
      if (!txHash) throw new Error('Transaction rejected.');
      showToast('Transaction sent. Confirming on server...', 'info');
    }

    // 3. Confirm purchase
    const confirmData = await apiCall('/api/nfts/buy/confirm-tx', {
      method: 'POST',
      body: { nftId, txHash }
    });

    showToast(confirmData.message, 'success');
    fetchNFTs();
    fetchOwnedNFTs();
  } catch (e) {
    showToast(e.message || 'NFT Purchase failed', 'error');
  }
}

function showNFTTab(tab) {
  document.querySelectorAll('.nft-tab').forEach(t => t.classList.remove('active'));

  if (tab === 'browse') {
    document.getElementById('nftTabBrowse').classList.add('active');
    document.getElementById('nftGrid').style.display = 'grid';
    document.getElementById('ownedNFTGrid').style.display = 'none';
    document.getElementById('nftFilters').style.display = 'flex';
  } else {
    document.getElementById('nftTabOwned').classList.add('active');
    document.getElementById('nftGrid').style.display = 'none';
    document.getElementById('ownedNFTGrid').style.display = 'grid';
    document.getElementById('nftFilters').style.display = 'none';
    fetchOwnedNFTs();
  }
}

async function fetchOwnedNFTs() {
  if (!authToken) return;

  try {
    const nfts = await apiCall('/api/nfts/owned');
    const grid = document.getElementById('ownedNFTGrid');

    if (nfts.length === 0) {
      grid.innerHTML = '<p class="empty-text" id="emptyOwned">You don\'t own any NFTs yet.</p>';
      return;
    }

    grid.innerHTML = nfts.map(nft => `
      <div class="nft-card">
        <img src="${nft.image}" alt="${nft.name}" class="nft-image" loading="lazy" />
        <div class="nft-info">
          <div class="nft-collection">${nft.collectionName}</div>
          <div class="nft-name">${nft.name}</div>
          <div class="nft-price-row">
            <span class="nft-price">${nft.price} ${nft.currency}</span>
            <span style="color:var(--success);font-size:0.8rem;font-weight:600;">Owned</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Owned NFTs error:', e);
  }
}

// ===== CHECK PREMIUM STATUS ON LOAD =====
function checkTierStatus() {
  if (currentUser) {
    if (currentUser.isPremium) {
      document.getElementById('premiumLock').classList.add('unlocked');
      document.getElementById('premiumBtn').textContent = '✓ Premium Active';
      document.getElementById('premiumBtn').disabled = true;
    }
    if (currentUser.isElite) {
      document.getElementById('eliteLock').classList.add('unlocked');
      document.getElementById('eliteBtn').textContent = '✓ Elite Active';
      document.getElementById('eliteBtn').disabled = true;
    }
  }
}

// ===== BLOCKCHAIN UTILS (METAMASK) =====
async function executeOnChainTransaction(txData) {
  if (!window.ethereum) {
    throw new Error('MetaMask is required for on-chain transactions.');
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts[0];

  // Optional: check network is Sepolia (0xaa36a7)
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId !== '0xaa36a7') {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      });
    } catch (e) {
      throw new Error('Please switch to the Sepolia testnet in MetaMask.');
    }
  }

  let txParams = {
    from: account
  };

  // Build the transaction based on action
  if (txData.action === 'mint') {
    // If buying CST, the user doesn't send a tx to the token contract. 
    // They just sign a message, or the server mints it for them directly.
    // In this app architecture, for 'buy', the server mints 1:1 on confirm.
    // So we just return a fake "signature" or txHash to proceed to confirm step.
    return '0x' + Array(64).fill(0).map(()=>Math.random().toString(16)[2]).join('');
  } else if (txData.action === 'transfer' || txData.action === 'transfer_nft') {
    txParams.to = txData.contractAddress;
    txParams.data = txData.encodedData;
    
    // Native eth gas estimation/send
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });
    
    return txHash;
  }

  return null;
}

// Fetch balances to show in Dashboard
async function fetchOnChainBalances() {
  if (!currentUser || !currentUser.walletAddress || currentUser.walletAddress === '0xadmin') return;
  
  try {
    const data = await apiCall(`/api/blockchain/balance/${currentUser.walletAddress}`);
    if (data.hasBlockchain) {
      const ocCard = document.getElementById('onChainBalanceCard');
      if (ocCard) {
        ocCard.style.display = 'flex';
        document.getElementById('ocEthBalance').textContent = parseFloat(data.eth).toFixed(4) + ' ETH';
        document.getElementById('ocCstBalance').textContent = parseFloat(data.cst).toFixed(2) + ' CST';
      }
    }
  } catch(e) {
    console.warn('Failed to fetch on-chain balances', e);
  }
}

// Initialize balances when dashboard loads
const originalLoadDashboard = loadDashboard;
loadDashboard = async function() {
  await originalLoadDashboard();
  fetchOnChainBalances();
};

// Run on load
setTimeout(checkTierStatus, 500);
