// services/blockchainService.js
const fs = 'fs'; // Native module, no path needed for require
const { ethers } = require("ethers");
const config = require('../config');

const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
const oracleWallet = new ethers.Wallet(config.oraclePrivateKey, provider);
const clientOrchestratorWallet = new ethers.Wallet(config.clientOrchestratorPrivateKey, provider);

console.log(`Client Orchestrator Address: ${clientOrchestratorWallet.address}`);
console.log(`Oracle Wallet Address: ${oracleWallet.address}`);

let claimOracleRelayContract, policyLedgerContract, inzoUSDContract, insuranceFundManagerContract;

try {
    // Note: Adjust paths if your ABI files are not in the root or a specific `abi/` directory
    const claimOracleRelayAbi = JSON.parse(fs.readFileSync('./abi/claimOracleRelay.abi.json', 'utf8'));
    const policyLedgerAbi = JSON.parse(fs.readFileSync('./abi/policyLedger.abi.json', 'utf8'));
    const inzoUSDAbi = JSON.parse(fs.readFileSync('./abi/inzoUSD.abi.json', 'utf8'));
    const insuranceFundManagerAbi = JSON.parse(fs.readFileSync('./abi/insuranceFundManager.abi.json', 'utf8'));

    claimOracleRelayContract = new ethers.Contract(config.contracts.claimOracleRelay, claimOracleRelayAbi, oracleWallet);
    policyLedgerContract = new ethers.Contract(config.contracts.policyLedger, policyLedgerAbi, clientOrchestratorWallet);
    inzoUSDContract = new ethers.Contract(config.contracts.inzoUSD, inzoUSDAbi, clientOrchestratorWallet);
    insuranceFundManagerContract = new ethers.Contract(config.contracts.insuranceFundManager, insuranceFundManagerAbi, clientOrchestratorWallet);
    
    console.log("Smart contracts initialized.");
} catch (e) {
    console.error("FATAL: Could not initialize smart contracts.", e.message);
    process.exit(1);
}

module.exports = {
    provider,
    oracleWallet,
    clientOrchestratorWallet,
    claimOracleRelayContract,
    policyLedgerContract,
    inzoUSDContract,
    insuranceFundManagerContract,
};
