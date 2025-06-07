// handlers/kycHandlers.js
const { ethers } = require("ethers");
const { userKycState } = require('../store/userState');
const personaApi = require('../services/personaApi');
const tavusApi = require('../services/tavusApi');
const blockchain = require('../services/blockchainService');
const config = require('../config');

function registerKycHandlers(bot) {
    bot.onText(/\/kyc/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (userKycState[userId]?.status === 'verified_on_chain') {
            bot.sendMessage(chatId, `✅ Your KYC is complete! Inzo Wallet: ${userKycState[userId].inzoWalletAddress}`);
            return;
        }
        userKycState[userId] = {}; // Reset state for new attempt
        bot.sendMessage(chatId, "✨ Starting KYC. First, document and selfie verification.");

        try {
            const inquiryResponse = await personaApi.createInquiry(`telegram-${userId}`);
            const inquiryId = inquiryResponse.data.data.id; // Corrected path based on typical Persona responses
            const linkResponse = await personaApi.generateOneTimeLink(inquiryId);
            const oneTimeLink = linkResponse.data.meta["one-time-link-short"] || linkResponse.data.meta["one-time-link"];
            
            userKycState[userId] = { documentInquiryId: inquiryId, status: 'pending_doc_completion' };
            bot.sendMessage(chatId, `Please complete the document and selfie verification using this link: ${oneTimeLink}\n\nAfter you have completed it, type /next_doc_verification_step.`);
        } catch (error) {
            console.error("Error initiating Document/Selfie KYC for user", userId, error.response?.data || error.message);
            bot.sendMessage(chatId, "Sorry, there was an issue starting the document/selfie verification process. Please try /kyc again later.");
        }
    });

    bot.onText(/\/next_doc_verification_step/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!userKycState[userId]?.documentInquiryId || userKycState[userId].status !== 'pending_doc_completion') {
            bot.sendMessage(chatId, "Please start with /kyc or ensure you have completed the document/selfie verification first.");
            return;
        }

        bot.sendMessage(chatId, "Checking your document/selfie verification status...");
        try {
            const inquiryDetails = await personaApi.getInquiryDetails(userKycState[userId].documentInquiryId);
            const docVerificationStatus = inquiryDetails.data.data.attributes.status;
            console.log(`User ${userId}: Document inquiry ${userKycState[userId].documentInquiryId} status: ${docVerificationStatus}`);

            if (docVerificationStatus === 'completed') {
                userKycState[userId].status = 'doc_verification_passed';
                bot.sendMessage(chatId, "✅ Document/Selfie verification successful! Next, a quick AI agent call to finalize KYC.");
                
                const conversationalContext = `You are an Inzo insurance KYC agent. The user has passed initial document verification. Your goal is to confirm their identity and understand their basic insurance needs. Please ask for their full name, date of birth, the primary reason they are seeking insurance, and an example of an item they might want to insure. Be friendly, professional, and concise (2-3 mins). After gathering the information, instruct the user to return to their Telegram chat and type /complete_kyc_interview.`;
                
                const tavusResponse = await tavusApi.createConversation(
                    config.tavusReplicaIdKyc,
                    `Inzo KYC Interview - User ${userId} - ${Date.now()}`,
                    conversationalContext
                );
                const conversationUrl = tavusResponse.data.conversation_url;
                const conversationId = tavusResponse.data.conversation_id;

                if (!conversationUrl || !conversationId) {
                    throw new Error("Tavus response missing URL/ID for KYC interview");
                }

                userKycState[userId].tavusKycConversationId = conversationId;
                userKycState[userId].status = 'pending_tavus_interview';
                bot.sendMessage(chatId, `Your AI agent call is ready! Please join using this link: ${conversationUrl}\n\nAfter the call, type /complete_kyc_interview here.`);
            } else if (['created', 'pending', 'needs_review'].includes(docVerificationStatus)) {
                bot.sendMessage(chatId, `Your document/selfie verification is currently '${docVerificationStatus}'. If you have completed it, please wait a moment and then try /next_doc_verification_step again.`);
            } else { // 'failed', 'expired', etc.
                bot.sendMessage(chatId, `❌ Document/Selfie verification status: '${docVerificationStatus}'. Please try the /kyc process again.`);
                userKycState[userId].status = 'doc_verification_failed';
            }
        } catch (error) {
            console.error(`/next_doc_verification_step error for user ${userId}:`, error.response?.data || error.message);
            bot.sendMessage(chatId, "An error occurred while processing your document verification or starting the AI call. Please try again.");
        }
    });

    bot.onText(/\/complete_kyc_interview/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!userKycState[userId]?.tavusKycConversationId || userKycState[userId].status !== 'pending_tavus_interview') {
            bot.sendMessage(chatId, "Please ensure you have completed the AI agent interview. If you have, please use the command provided at the end of the call, or start with /kyc if needed.");
            return;
        }

        bot.sendMessage(chatId, "✅ AI agent call completed (simulated pass). Creating your Inzo Wallet and updating KYC status on-chain...");
        userKycState[userId].status = 'tavus_interview_completed';

        try {
            const newInzoWallet = ethers.Wallet.createRandom();
            const inzoWalletAddress = newInzoWallet.address;
            const inzoWalletPk = newInzoWallet.privateKey; 
            
            userKycState[userId].inzoWalletAddress = inzoWalletAddress;
            userKycState[userId].inzoWalletPk = inzoWalletPk; // Store PK for bot-managed transfers

            bot.sendMessage(chatId, `Your Inzo Wallet has been created!\nAddress: ${inzoWalletAddress}\n\n⚠️ This is for a DEMO. In a real scenario, you would manage your private key. For this demo, the bot holds it to facilitate actions.`);
            console.log(`User ${userId} Inzo Wallet created: Address - ${inzoWalletAddress}`);

            // Update KYC status on-chain
            const tx = await blockchain.claimOracleRelayContract.updateKycStatus(inzoWalletAddress, true);
            await tx.wait();
            
            userKycState[userId].status = 'verified_on_chain';
            bot.sendMessage(chatId, `✅ Your Inzo Wallet (${inzoWalletAddress}) is now KYC verified on-chain!`);
            
            bot.sendMessage(chatId, `To use your wallet for transactions (like paying premiums), it will need some WND for gas fees. Please consider funding it with a small amount (e.g., ~0.5-2 WND).`);

            // Mint initial InzoUSD for the user
            const initialInzoUSDAmount = ethers.utils.parseUnits("3000", 18); // 3000 InzoUSD
            const mintTx = await blockchain.inzoUSDContract.connect(blockchain.clientOrchestratorWallet).mint(inzoWalletAddress, initialInzoUSDAmount);
            await mintTx.wait();
            
            bot.sendMessage(chatId, `💰 As a welcome gift, your Inzo Wallet has been credited with 3,000 InzoUSD! You can check your balance with /my_wallet.`);

        } catch (error) {
            console.error("Error during Inzo Wallet finalization or on-chain KYC update:", error.response?.data || error.message);
            bot.sendMessage(chatId, "An error occurred while setting up your Inzo Wallet or updating your KYC status on-chain. Please contact support or try again later.");
            userKycState[userId].status = 'setup_failed'; // Mark as failed to allow retry or diagnosis
        }
    });
}

module.exports = { registerKycHandlers };
