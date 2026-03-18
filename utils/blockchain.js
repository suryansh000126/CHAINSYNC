/**
 * ChainSync — Blockchain Utility Module
 * Shared ethers.js provider + contract instances for backend use.
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

let provider = null;
let deployerWallet = null;
let tokenContract = null;
let nftContract = null;

/**
 * Get ethers provider for Sepolia
 */
function getProvider() {
  if (!provider) {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      console.warn('⚠️ SEPOLIA_RPC_URL not set — blockchain features disabled');
      return null;
    }
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }
  return provider;
}

/**
 * Get deployer wallet (server-side, for minting operations)
 */
function getDeployerWallet() {
  if (!deployerWallet) {
    const prov = getProvider();
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!prov || !key) return null;
    deployerWallet = new ethers.Wallet(key, prov);
  }
  return deployerWallet;
}

/**
 * Load contract ABI + address from the abi directory
 */
function loadContract(name) {
  try {
    const abiPath = path.join(__dirname, '..', 'contracts', 'abi', `${name}.json`);
    if (!fs.existsSync(abiPath)) return null;
    return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  } catch (e) {
    console.warn(`⚠️ Could not load ${name} ABI:`, e.message);
    return null;
  }
}

/**
 * Get ChainSync Token (ERC-20) contract instance
 */
function getTokenContract() {
  if (!tokenContract) {
    const wallet = getDeployerWallet();
    const data = loadContract('ChainSyncToken');
    if (!wallet || !data) return null;

    // Override address from .env if present
    const address = process.env.CST_CONTRACT_ADDRESS || data.address;
    tokenContract = new ethers.Contract(address, data.abi, wallet);
  }
  return tokenContract;
}

/**
 * Get ChainSync NFT (ERC-721) contract instance
 */
function getNFTContract() {
  if (!nftContract) {
    const wallet = getDeployerWallet();
    const data = loadContract('ChainSyncNFT');
    if (!wallet || !data) return null;

    const address = process.env.NFT_CONTRACT_ADDRESS || data.address;
    nftContract = new ethers.Contract(address, data.abi, wallet);
  }
  return nftContract;
}

/**
 * Get ETH + CST balance for a wallet address
 */
async function getWalletBalance(address) {
  const prov = getProvider();
  if (!prov) return { eth: '0', cst: '0', hasBlockchain: false };

  try {
    const ethBalance = await prov.getBalance(address);
    let cstBalance = '0';

    const token = getTokenContract();
    if (token) {
      const raw = await token.balanceOf(address);
      cstBalance = ethers.utils.formatEther(raw);
    }

    return {
      eth: ethers.utils.formatEther(ethBalance),
      cst: cstBalance,
      hasBlockchain: true
    };
  } catch (e) {
    console.error('Balance check error:', e.message);
    return { eth: '0', cst: '0', hasBlockchain: false };
  }
}

/**
 * Mint CST tokens to an address (server-side, for mining rewards)
 */
async function mintTokens(toAddress, amount) {
  const token = getTokenContract();
  if (!token) throw new Error('Token contract not available');

  const tx = await token.mint(toAddress, amount);
  const receipt = await tx.wait();
  return {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    amount
  };
}

/**
 * Mint an NFT to an address (server-side)
 */
async function mintNFT(toAddress, tokenURI) {
  const nft = getNFTContract();
  if (!nft) throw new Error('NFT contract not available');

  const tx = await nft.mintNFT(toAddress, tokenURI);
  const receipt = await tx.wait();

  // Extract tokenId from Transfer event
  const transferEvent = receipt.events?.find(e => e.event === 'Transfer');
  const tokenId = transferEvent ? transferEvent.args.tokenId.toString() : null;

  return {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    tokenId
  };
}

/**
 * Check if blockchain features are available
 */
function isBlockchainEnabled() {
  return !!(process.env.SEPOLIA_RPC_URL && process.env.CST_CONTRACT_ADDRESS);
}

/**
 * Get contract addresses and network info for frontend
 */
function getNetworkInfo() {
  return {
    enabled: isBlockchainEnabled(),
    network: 'sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL || null,
    contracts: {
      token: process.env.CST_CONTRACT_ADDRESS || null,
      nft: process.env.NFT_CONTRACT_ADDRESS || null
    }
  };
}

module.exports = {
  getProvider,
  getDeployerWallet,
  getTokenContract,
  getNFTContract,
  getWalletBalance,
  mintTokens,
  mintNFT,
  isBlockchainEnabled,
  getNetworkInfo,
  loadContract
};
