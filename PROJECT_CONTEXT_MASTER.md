# 🌐 ChainSync: Master Project Context & Handover

This document serves as the "Source of Truth" for the **ChainSync** project. It contains the technical architecture, current development stage, and a resolution audit of previous project requirements.

---

## 🏗️ 1. Technical Architecture
**ChainSync** is a production-ready Cryptocurrency Single Page Application (SPA) built on a modern full-stack JavaScript architecture.

- **Stack**: Node.js, Express, MongoDB Atlas (Cloud), Vanilla JS/CSS.
- **Backend Infrastructure**: 
    - `server.js`: Orchestrates the REST API and a real-time WebSocket proxy.
    - `models/`: Mongoose schemas for Users, Portfolios, Vaults, Trades, Mining, and NFTs.
- **Security Protocols**:
    - **Wallet Auth**: `ethers.js` signature verification mapped to backend JWT sessions.
    - **Seed Vault**: AES-256-GCM encryption for seed phrases. Key derivation via PBKDF2 (100k iterations). Zero-knowledge (password stays only with the user).
- **External Data**:
    - **Prices**: Binance WebSocket API (`wss://stream.binance.com`).
    - **Market Analysis**: CoinGecko REST API (AI Picks & P&L calculations).
- **Mining Engine**: Browser-based multithreaded SHA-256 worker (`mining-worker.js`).

---

## 📍 2. Current Development Stage
**Stage: Beta Production (Infrastructure Complete)**

The webapp has transitioned from a Flask mockup to a live, persistent cloud-connected infrastructure.
- [x] **Database**: Fully connected to MongoDB Atlas.
- [x] **Real-time Engine**: Price ticker and trading panels are live-updating.
- [x] **Authentication**: Wallet-based login is integrated.
- [x] **Vault**: Functional encryption/decryption system.
- [x] **UX/UI**: Premium Glassmorphism theme implemented across all 6 sections.
- [x] **Mining**: Active Web Worker hashing engine is operational.

---

## ✅ 3. Historical Problem Audit (Last 10 Chats)
We have verified that the following problems from previous sessions have been successfully resolved:

| Previous Problem | Current Solution | Status |
| :--- | :--- | :--- |
| **"AI-Looking" UI** | Custom professional Glassmorphism theme (Green/Dark palette). | RESOLVED |
| **Static Data** | Integrated real-time Binance WebSocket & CoinGecko APIs. | RESOLVED |
| **Flask Limitations** | Migrated to Node.js for superior real-time performance. | RESOLVED |
| **Mock Mining** | Implemented real SHA-256 hashing via Web Workers. | RESOLVED |
| **Storage Security** | Built a secure, encrypted Seed Vault (Account Abstraction Ready). | RESOLVED |
| **Empty UI** | Patched frontend to show `0` states for new/unauthed users. | RESOLVED |

---

## 🗺️ 4. Future Roadmap & Handover
For future developers or AI models, the next logical steps are:
1. **Cloud Deployment**: Move the `localhost` server to a host like Render, Railway, or AWS.
2. **On-Chain Interactions**: Integrate a Smart Contract for "Real" token minting/swapping.
3. **NFT Minting**: Replace `SEED_NFTS` mock data with a real minting function.
4. **Enhanced AI**: Integrate an LLM (OpenAI/Gemini API) for natural language market advice.

---

**Current Directory**: `c:\Users\Suryansh\Desktop\mini project`
**Base URL**: `http://localhost:3000`
**Config File**: `.env` (contains DB credentials and API endpoints)
