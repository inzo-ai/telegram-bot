// services/tavusApi.js
const axios = require('axios');
const config = require('../config');

const tavusClient = axios.create({
    baseURL: 'https://tavusapi.com/v2',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.tavusApiKey,
    }
});

async function createConversation(replicaId, conversationName, conversationalContext) {
    return tavusClient.post('/conversations', {
        replica_id: replicaId,
        conversation_name: conversationName,
        conversational_context: conversationalContext,
    });
}

// Add other Tavus API functions if needed

module.exports = {
    createConversation,
};
