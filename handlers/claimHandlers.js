// handlers/claimHandlers.js
const { ethers } = require("ethers");
const { userKycState, userClaimData } = require('../store/userState');
const blockchain = require('../services/blockchainService');
const tavusApi = require('../services/tavusApi');
const geminiOracleApi = require('../services/geminiOracleApi'); // NEW
const config = require('../config');
const { delay } = require('../utils');

function registerClaimHandlers(bot) {
    bot.onText(/\/file_claim (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const policyIdStr = match[1];
        const policyId = parseInt(policyIdStr);

        if (isNaN(policyId) || policyId <= 0) {
            bot.sendMessage(chatId, "Invalid Policy ID.");
            return;
        }
        if (userKycState[userId]?.status !== 'verified_on_chain') {
            bot.sendMessage(chatId, "You must complete KYC (/kyc) before filing a claim.");
            return;
        }

        try {
            const [, holder, status,] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(policyId);
            if (holder !== userKycState[userId].inzoWalletAddress) {
                bot.sendMessage(chatId, "This policy does not belong to you.");
                return;
            }
            if (status !== 1) { // 1 is Active
                const statusMap = ["PendingApplication", "Active", "Expired", "Cancelled", "ClaimUnderReview", "ClaimPaid", "ClaimRejected"];
                bot.sendMessage(chatId, `Claims can only be filed for Active policies. Current status: ${statusMap[status] || 'Unknown'}`);
                return;
            }

            const claimPrompt = await bot.sendMessage(chatId, "Please describe the incident for your claim. Reply to this message with your description:", {
                reply_markup: { force_reply: true }
            });

            bot.onReplyToMessage(chatId, claimPrompt.message_id, async (claimMsg) => {
                const claimDescription = claimMsg.text;
                if (!claimDescription || claimDescription.trim() === "") {
                    bot.sendMessage(chatId, "Claim description cannot be empty. Please try /file_claim again.");
                    return;
                }
                const claimKey = `${userId}_${policyId}`;
                userClaimData[claimKey] = { description: claimDescription, policyId: policyId };

                bot.sendMessage(chatId, `Thank you. Initiating AI claim investigation for Policy ID ${policyId}...`);
                
                const [, , , coverageForCall] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(policyId);
                const [premiumForCall, , riskForCall] = await blockchain.policyLedgerContract.getPolicyFinancialAndDateTerms(policyId);
                const assetIdForCall = await blockchain.policyLedgerContract.getPolicyAssetIdentifier(policyId);
                
                const policyDetailsForCall = `Asset: ${assetIdForCall}, Coverage: ${ethers.utils.formatUnits(coverageForCall, 18)} InzoUSD, Premium: ${ethers.utils.formatUnits(premiumForCall, 18)} InzoUSD, Risk Tier: ${riskForCall}`;
                const conversationalContext = `You are an Inzo Insurance claim investigator for Policy ID ${policyId}. Policy Details: ${policyDetailsForCall}. User's reported incident: "${claimDescription}". Your role is to ask clarifying questions about the incident (what, when, where, how, any supporting evidence like photos/receipts if applicable). Be empathetic and professional. After gathering necessary details, end the conversation by instructing the user to return to their Telegram chat and type /continue_claim ${policyId} [YOUR_CONVERSATION_ID_HERE].`;

                try {
                    const tavusResponse = await tavusApi.createConversation(
                        config.tavusReplicaIdClaim,
                        `Inzo Claim - Policy ${policyId} - User ${userId} - ${Date.now()}`,
                        conversationalContext
                    );
                    const tavusConversationUrl = tavusResponse.data.conversation_url;
                    const tavusConversationId = tavusResponse.data.conversation_id;

                    if (!tavusConversationUrl || !tavusConversationId) {
                        throw new Error("Tavus response missing URL/ID for claim call");
                    }
                    
                    userClaimData[claimKey].tavusConversationId = tavusConversationId;
                    // Update policy status to ClaimUnderReview
                    const tx = await blockchain.policyLedgerContract.connect(blockchain.clientOrchestratorWallet).updatePolicyStatus(policyId, 4); // 4 for ClaimUnderReview
                    await tx.wait();

                    bot.sendMessage(chatId, `Your claim investigation call is ready. Please join using this link: ${tavusConversationUrl}\n\nAfter the call, please type the following command here: /continue_claim ${policyId} ${tavusConversationId}`);
                } catch (tavusError) {
                    console.error("Tavus claim call error:", tavusError.response?.data || tavusError.message);
                    bot.sendMessage(chatId, "We couldn't start the AI claim investigation call at this moment. Please try filing the claim again or contact support.");
                     // Optionally revert status if it was changed, or handle cleanup
                }
            });
        } catch (e) {
            console.error("File claim error:", e.response?.data || e.message, e.stack);
            bot.sendMessage(chatId, "An error occurred while initiating your claim. Please try again.");
        }
    });

    bot.onText(/\/continue_claim (\d+) (\S+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const policyIdStr = match[1];
        const policyId = parseInt(policyIdStr);
        const tavusConvIdFromUser = match[2];

        if (isNaN(policyId) || policyId <= 0) {
            bot.sendMessage(chatId, "Invalid Policy ID in the command.");
            return;
        }

        const claimKey = `${userId}_${policyId}`;
        const currentClaimData = userClaimData[claimKey];

        if (!currentClaimData?.tavusConversationId || currentClaimData.tavusConversationId !== tavusConvIdFromUser) {
            bot.sendMessage(chatId, "The claim session ID or policy ID doesn't match an active claim process. Please ensure you've used the exact command provided after your AI agent call. If the issue persists, you might need to start the claim process again with /file_claim.");
            return;
        }

        bot.sendMessage(chatId, "✅ Claim investigation call complete. Your claim is now being submitted to our AI Oracle for a decision. This may take a few moments...");
        
        try {
            // This ID needs to be consistent for the Oracle to use it when calling submitClaimDecision
            const oracleSystemClaimId = ethers.BigNumber.from(ethers.utils.id(tavusConvIdFromUser)).mod(ethers.constants.MaxUint256);
            
            // --- Integration with Gemini AI Oracle ---
            // The bot requests the external Gemini Oracle to make a decision.
            // The Gemini Oracle will internally call claimOracleRelayContract.submitClaimDecision.
            const claimDetailsForOracle = {
                description: currentClaimData.description,
                // Potentially add more details if needed by the oracle service
            };
            await geminiOracleApi.requestClaimDecision(
                policyId,
                oracleSystemClaimId,
                tavusConvIdFromUser,
                userId.toString(),
                claimDetailsForOracle
            );
            bot.sendMessage(chatId, "🤖 Your claim has been sent to the AI Oracle. We are now awaiting the on-chain decision. Polling for results (this might take up to a minute)...");

            // Polling for the Oracle's decision on-chain
            let decision;
            let attempts = 0;
            const maxAttempts = 12; // Poll for 12 * 5s = 60 seconds
            const pollInterval = 5000; // 5 seconds

            while (attempts < maxAttempts) {
                await delay(pollInterval);
                try {
                    // Use clientOrchestratorWallet or a generic provider for reading
                    decision = await blockchain.claimOracleRelayContract.connect(blockchain.provider).getClaimDecision(policyId, oracleSystemClaimId);
                    if (!decision.timestamp.isZero()) { // Decision has been recorded
                        break;
                    }
                } catch (pollError) {
                    console.warn(`Polling attempt ${attempts + 1} failed: ${pollError.message}`);
                }
                attempts++;
                bot.sendChatAction(chatId, 'typing'); // Keep user informed
            }

            if (!decision || decision.timestamp.isZero()) {
                bot.sendMessage(chatId, "⏳ The AI Oracle's decision is taking longer than expected to appear on-chain. Please check back later or contact support. Your claim (ID for Oracle: " + oracleSystemClaimId.toString() + ") is still being processed.");
                // Keep userClaimData for potential manual follow-up or retry
                return;
            }

            bot.sendMessage(chatId, "AI Oracle has submitted a decision to the blockchain!");

            // Process the decision
            if (decision.isApproved) {
                const [, policyHolder,, coverageAmount] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(policyId); // Re-fetch details if needed
                 // The payoutAmount is now part of the `decision` from the Oracle
                const payoutAmountFromOracle = decision.payoutAmount;

                bot.sendMessage(chatId, `🎉 Claim Approved by Oracle! Payout amount: ${ethers.utils.formatUnits(payoutAmountFromOracle, 18)} InzoUSD. Processing payout...`);

                let tx = await blockchain.insuranceFundManagerContract.connect(blockchain.clientOrchestratorWallet).processClaimPayout(policyId, policyHolder, payoutAmountFromOracle);
                await tx.wait();
                
                tx = await blockchain.policyLedgerContract.connect(blockchain.clientOrchestratorWallet).updatePolicyStatus(policyId, 5); // 5 for ClaimPaid
                await tx.wait();
                
                bot.sendMessage(chatId, `✅ Claim Paid! ${ethers.utils.formatUnits(payoutAmountFromOracle, 18)} InzoUSD has been sent to your Inzo Wallet. You can check your balance with /my_wallet.`);
            } else {
                let tx = await blockchain.policyLedgerContract.connect(blockchain.clientOrchestratorWallet).updatePolicyStatus(policyId, 6); // 6 for ClaimRejected
                await tx.wait();
                bot.sendMessage(chatId, `ℹ️ Your claim for policy ID ${policyId.toString()} has been reviewed by the AI Oracle and, unfortunately, was not approved at this time. Please contact support for more details.`);
            }
            delete userClaimData[claimKey]; // Clean up claim state

        } catch (e) {
            console.error("Claim resolution or Oracle interaction error:", e.response?.data || e.message, e.stack);
            bot.sendMessage(chatId, "An error occurred while finalizing your claim or interacting with the Oracle. Please contact support with your Policy ID and Tavus Conversation ID.");
            // Do not delete userClaimData[claimKey] here to allow for debugging or retry
        }
    });
}

module.exports = { registerClaimHandlers };
