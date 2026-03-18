/**
 * ChainSync — Smart Contract Deployment Script
 * Compiles and deploys ChainSyncToken (ERC-20) and ChainSyncNFT (ERC-721) to Sepolia.
 * 
 * Usage: node contracts/deploy.js
 * Requires: SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in .env
 */

require('dotenv').config();
const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!SEPOLIA_RPC || !PRIVATE_KEY) {
  console.error('❌ Missing SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY in .env');
  process.exit(1);
}

function compileSolidity(filename) {
  const filePath = path.join(__dirname, filename);
  const source = fs.readFileSync(filePath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { [filename]: { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter(e => e.severity === 'error');
    if (fatal.length > 0) {
      console.error('❌ Compilation errors:');
      fatal.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
    // Show warnings
    output.errors.filter(e => e.severity === 'warning').forEach(e => {
      console.warn('⚠️', e.message);
    });
  }

  const contractName = Object.keys(output.contracts[filename])[0];
  const contract = output.contracts[filename][contractName];

  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object
  };
}

async function deploy() {
  console.log('🔗 Connecting to Sepolia...');
  const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const balance = await wallet.getBalance();
  console.log(`💰 Deployer: ${wallet.address}`);
  console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH`);

  if (balance.lt(ethers.utils.parseEther('0.01'))) {
    console.error('❌ Insufficient ETH for deployment. Get testnet ETH from https://sepoliafaucet.com/');
    process.exit(1);
  }

  // Deploy ChainSyncToken
  console.log('\n📦 Compiling ChainSyncToken.sol...');
  const tokenCompiled = compileSolidity('ChainSyncToken.sol');

  console.log('🚀 Deploying ChainSync Token (CST)...');
  const TokenFactory = new ethers.ContractFactory(tokenCompiled.abi, tokenCompiled.bytecode, wallet);
  const tokenContract = await TokenFactory.deploy(1000000); // 1M initial supply
  await tokenContract.deployed();
  console.log(`✅ ChainSync Token deployed at: ${tokenContract.address}`);

  // Deploy ChainSyncNFT
  console.log('\n📦 Compiling ChainSyncNFT.sol...');
  const nftCompiled = compileSolidity('ChainSyncNFT.sol');

  console.log('🚀 Deploying ChainSync NFT (CSNFT)...');
  const NFTFactory = new ethers.ContractFactory(nftCompiled.abi, nftCompiled.bytecode, wallet);
  const nftContract = await NFTFactory.deploy();
  await nftContract.deployed();
  console.log(`✅ ChainSync NFT deployed at: ${nftContract.address}`);

  // Save ABIs for backend/frontend use
  const abiDir = path.join(__dirname, 'abi');
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir);

  fs.writeFileSync(
    path.join(abiDir, 'ChainSyncToken.json'),
    JSON.stringify({ address: tokenContract.address, abi: tokenCompiled.abi }, null, 2)
  );
  fs.writeFileSync(
    path.join(abiDir, 'ChainSyncNFT.json'),
    JSON.stringify({ address: nftContract.address, abi: nftCompiled.abi }, null, 2)
  );

  console.log('\n📁 ABIs saved to contracts/abi/');

  // Print .env values to add
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Add these to your .env file:');
  console.log(`CST_CONTRACT_ADDRESS=${tokenContract.address}`);
  console.log(`NFT_CONTRACT_ADDRESS=${nftContract.address}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

deploy().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
