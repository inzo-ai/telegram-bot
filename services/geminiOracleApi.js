// services/geminiOracleApi.js
const axios = require('axios');
const config = require('../config');

async function requestClaimDecision(policyId, oracleSystemClaimId, tavusConversationId, userId, claimDetails) {
    try {
        console.log(`Requesting claim decision from Gemini Oracle for policy ${policyId}, claim ID: ${oracleSystemClaimId}`);
        const response = await axios.post(config.geminiOracleEndpoint, {
            policyId: policyId.toString(), // Ensure string for JSON
            oracleSystemClaimId: oracleSystemClaimId.toString(), // Ensure string
            tavusConversationId: tavusConversationId,
            userId: userId.toString(),
            claimDetails: claimDetails // e.g., { description: "...", asset: "...", coverage: "..." }
        });
        console.log('Gemini Oracle API response status:', response.status);
        return response.data; // Assuming the oracle service returns some acknowledgement
    } catch (error) {
        console.error('Error calling Gemini Oracle API:', error.response?.data || error.message);
        throw new Error(`Failed to request claim decision from Gemini Oracle: ${error.message}`);
    }
}

module.exports = {
    requestClaimDecision,
};
