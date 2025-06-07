// handlers/commonHandlers.js
const { userPolicyApplications, userKycState } = require('../store/userState');
const { applicationQuestions } = require('./policyHandlers'); // Import from policyHandlers
const tavusApi = require('../services/tavusApi');
const config = require('../config');

function registerCommonHandlers(bot) {
    bot.onText(/\/start|\/help/, (msg) => {
        const chatId = msg.chat.id;
        const helpMessage = `👋 Welcome to Inzo - Intelligent Insurance!
Available commands:
/kyc - Start KYC (Document/Selfie + AI Agent call).
/next_doc_verification_step - (After Doc/Selfie) Continue KYC.
/complete_kyc_interview - (After AI call) Finalize KYC & get Inzo Wallet.
/my_wallet - View Inzo Wallet & transfer options.
/transfer_inzousd <to_address> <amount> - Transfer InzoUSD.
/apply_policy - Start a new policy application (includes AI agent call).
/complete_policy_application <tavus_policy_conv_id> - After policy AI agent call.
/my_policies - View all your policies.
/view_policy <policy_id> - View specific policy details.
/pay_premium <policy_id> - Pay premium.
/file_claim <policy_id> - Initiate a claim (includes AI agent call).
/continue_claim <policy_id> <tavus_claim_conv_id> - After claim investigation call.
/help - Show this message.`;
        bot.sendMessage(chatId, helpMessage);
    });

    // Generic message handler (for policy application questions)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (text && text.startsWith('/')) { // Ignore commands
            return;
        }

        // Handle policy application question responses
        const policyApp = userPolicyApplications[userId];
        if (policyApp && policyApp.status === 'pending_questions' && policyApp.step < applicationQuestions.length) {
            policyApp.answers.push(text);
            policyApp.step++;

            if (policyApp.step < applicationQuestions.length) {
                bot.sendMessage(chatId, applicationQuestions[policyApp.step]);
            } else {
                policyApp.status = 'pending_tavus_policy_call';
                const answers = policyApp.answers;
                const assetToInsure = answers[0];
                const desiredCoverageStr = answers[1];
                const reasonForInsurance = answers[2];

                bot.sendMessage(chatId, `Thanks! Now, a quick AI agent call to discuss your application for insuring: ${assetToInsure}.`);
                
                const conversationalContext = `You are an Inzo insurance agent discussing a new policy application. User wants to insure: ${assetToInsure}, Desired Coverage: ${desiredCoverageStr} InzoUSD, Reason: ${reasonForInsurance}. Confirm details, assess reasonableness (assume yes for demo), ensure user understands basics. End by telling user to type /complete_policy_application [YOUR_CONVERSATION_ID_HERE] in Telegram.`;
                
                try {
                    const tavusResponse = await tavusApi.createConversation(
                        config.tavusReplicaIdPolicy,
                        `Inzo Policy App - User ${userId} - ${Date.now()}`,
                        conversationalContext
                    );
                    const conversationUrl = tavusResponse.data.conversation_url;
                    const conversationId = tavusResponse.data.conversation_id;
                    
                    if (!conversationUrl || !conversationId) {
                        throw new Error("Tavus response missing URL/ID for policy call");
                    }
                    
                    policyApp.tavusPolicyConvId = conversationId;
                    bot.sendMessage(chatId, `Join AI agent call: ${conversationUrl}\n\nAfter call, type: /complete_policy_application ${conversationId}`);
                } catch (error) {
                    console.error("Tavus policy app call error:", error.response?.data || error.message);
                    bot.sendMessage(chatId, "Couldn't start policy app video call. Try /apply_policy again.");
                    delete userPolicyApplications[userId];
                }
            }
        }
    });
}

module.exports = { registerCommonHandlers };
