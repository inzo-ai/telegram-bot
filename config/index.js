// config/index.js
require('dotenv').config();

const config = {
    botToken: process.env.BOT_TOKEN,
    tavusApiKey: process.env.TAVUS_API_KEY,
    tavusReplicaIdKyc: process.env.TAVUS_REPLICA_ID_KYC || process.env.TAVUS_REPLICA_ID,
    tavusReplicaIdPolicy: process.env.TAVUS_REPLICA_ID_POLICY || process.env.TAVUS_REPLICA_ID,
    tavusReplicaIdClaim: process.env.TAVUS_REPLICA_ID_CLAIM || process.env.TAVUS_REPLICA_ID,
    personaApiKey: process.env.PERSONA_API_KEY,
    oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY,
    clientOrchestratorPrivateKey: process.env.DEPLOYER_PRIVATE_KEY, // Matches original .env key
    rpcUrl: process.env.WESTEND_ASSET_HUB_RPC_URL,
    contracts: {
        claimOracleRelay: process.env.CLAIMORACLERELAY_CONTRACT_ADDRESS,
        policyLedger: process.env.POLICYLEDGER_CONTRACT_ADDRESS,
        inzoUSD: process.env.INZOUSD_CONTRACT_ADDRESS,
        insuranceFundManager: process.env.INSURANCEFUNDMANAGER_CONTRACT_ADDRESS,
    },
    geminiOracleEndpoint: process.env.GEMINI_ORACLE_ENDPOINT,
    personaBaseUrl: 'https://withpersona.com/api/v1', // Standard Persona API base URL
};

const requiredVars = [
    'botToken', 'tavusApiKey', 'tavusReplicaIdKyc', 'personaApiKey',
    'oraclePrivateKey', 'clientOrchestratorPrivateKey', 'rpcUrl',
    'contracts.claimOracleRelay', 'contracts.policyLedger',
    'contracts.inzoUSD', 'contracts.insuranceFundManager', 'geminiOracleEndpoint'
];

function validateConfig(obj, path = '') {
    for (const key of requiredVars) {
        const keys = key.split('.');
        let current = obj;
        let currentPath = '';
        let found = true;
        for (const k of keys) {
            currentPath = currentPath ? `${currentPath}.${k}` : k;
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                found = false;
                break;
            }
        }
        if (!found || current === undefined || current === null || current === '') {
            console.error(`FATAL: Critical environment variable/config key missing: ${key.toUpperCase().replace(/\./g, '_')}`);
            process.exit(1);
        }
    }
}

validateConfig(config);

module.exports = config;
