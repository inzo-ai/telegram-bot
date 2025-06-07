// services/personaApi.js
const axios = require('axios');
const config = require('../config');

const personaClient = axios.create({
    baseURL: config.personaBaseUrl,
    headers: {
        'Authorization': `Bearer ${config.personaApiKey}`,
        'Persona-Version': '2021-05-14', // Specify a Persona API version
        'Content-Type': 'application/json',
    }
});

async function createInquiry(referenceId) {
    // Note: Template ID might be needed. This is a generic example.
    // Ensure your Persona account is set up with a template for this.
    // For "Document/Selfie", you might use a specific template_id.
    // The original code didn't specify one, relying on account default perhaps.
    return personaClient.post('/inquiries', {
        data: {
            attributes: {
                'reference-id': referenceId,
                // 'inquiry-template-id': 'itmpl_YOUR_DOCUMENT_VERIFICATION_TEMPLATE_ID' // Potentially needed
            }
        }
    });
}

async function generateOneTimeLink(inquiryId) {
    return personaClient.post(`/inquiries/${inquiryId}/generate-one-time-link`);
}

async function getInquiryDetails(inquiryId) {
    return personaClient.get(`/inquiries/${inquiryId}`);
}

module.exports = {
    createInquiry,
    generateOneTimeLink,
    getInquiryDetails,
};
