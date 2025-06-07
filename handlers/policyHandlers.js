// handlers/policyHandlers.js
const { ethers } = require("ethers");
const { userKycState, userPolicyApplications } = require('../store/userState');
const blockchain = require('../services/blockchainService');
const tavusApi = require('../services/tavusApi');
const config = require('../config');

const applicationQuestions = [
    "What asset would you like to insure? (e.g., MacBook Pro 16-inch 2023, iPhone 15 Pro)",
    "What is the desired coverage amount in InzoUSD? (e.g., 1500)",
    "Briefly, what is the primary reason you are seeking insurance for this asset?"
];

function registerPolicyHandlers(bot) {
    bot.onText(/\/apply_policy/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (userKycState[userId]?.status !== 'verified_on_chain') {
            bot.sendMessage(chatId, "To apply for a policy, you need to complete the KYC process first. Please use /kyc.");
            return;
        }
        // Reset or initialize policy application state
        userPolicyApplications[userId] = { step: 0, answers: [], status: 'pending_questions' };
        bot.sendMessage(chatId, `Let's start your new insurance policy application!\n\n${applicationQuestions[0]}`);
    });

    bot.onText(/\/complete_policy_application (\S+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const tavusConvIdFromUser = match[1];

        const policyApp = userPolicyApplications[userId];
        if (!policyApp || policyApp.status !== 'pending_tavus_policy_call' || policyApp.tavusPolicyConvId !== tavusConvIdFromUser) {
            bot.sendMessage(chatId, "It seems there's a mismatch with your policy application session or the provided ID. Please ensure you're using the command given after the AI agent call, or start a new application with /apply_policy.");
            return;
        }

        bot.sendMessage(chatId, "✅ Policy AI agent call completed! Proceeding to create your policy application on-chain...");
        policyApp.status = 'tavus_policy_call_done';
        const appData = policyApp.answers;

        try {
            const assetToInsure = appData[0];
            const desiredCoverageStr = appData[1];
            // const reasonForInsurance = appData[2]; // Available if needed for policy details

            let desiredCoverage;
            try {
                desiredCoverage = ethers.utils.parseUnits(desiredCoverageStr, 18); // 18 decimals for InzoUSD
                if(desiredCoverage.lte(0)) throw new Error("Coverage amount must be a positive value.");
            } catch(e){
                bot.sendMessage(chatId, "Invalid coverage amount specified. Please start the application again with /apply_policy and enter a valid number for coverage.");
                delete userPolicyApplications[userId];
                return;
            }

            // Simplified premium calculation (e.g., 5% of coverage) and risk tier for demo
            const premiumAmount = desiredCoverage.mul(5).div(100); // 5% premium
            const riskTier = 0; // 0: Standard, 1: Preferred, 2: HighRisk (enum PolicyLedger.RiskTier)
            const oneDayInSeconds = 24 * 60 * 60;
            const startDate = Math.floor(Date.now() / 1000); // Current timestamp in seconds
            const endDate = startDate + (365 * oneDayInSeconds); // 1 year policy

            // Create a unique hash for policy terms (can be more sophisticated)
            const policyDetailsHash = ethers.utils.id(`Policy terms for ${assetToInsure} with coverage ${desiredCoverageStr} InzoUSD, Start: ${startDate}, End: ${endDate}`);
            
            const policyInput = {
                policyHolder: userKycState[userId].inzoWalletAddress,
                riskTier: riskTier,
                premiumAmount: premiumAmount,
                coverageAmount: desiredCoverage,
                startDate: startDate,
                endDate: endDate,
                assetIdentifier: assetToInsure, // Store the asset description
                policyDetailsHash: policyDetailsHash 
            };
            
            // The createPolicy function in the contract is expected to return the new policy ID.
            // We listen for the PolicyCreated event to get the ID, or use callStatic for prediction if needed.
            // For simplicity, assuming createPolicy returns ID or we get it from tx receipt event.
            // A robust way is to listen for the PolicyCreated event. Here we assume direct return or easy event parsing.

            bot.sendMessage(chatId, "Submitting policy to the ledger...");
            const tx = await blockchain.policyLedgerContract.connect(blockchain.clientOrchestratorWallet).createPolicy(policyInput);
            const receipt = await tx.wait();
            
            // Find PolicyCreated event in logs to get policyId
            let policyId = null;
            const eventFragment = blockchain.policyLedgerContract.interface.getEvent("PolicyCreated");
            for (const log of receipt.logs) {
                try {
                    const parsedLog = blockchain.policyLedgerContract.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === eventFragment.name) {
                        policyId = parsedLog.args.policyId;
                        break;
                    }
                } catch (e) { /* ignore non-matching logs */ }
            }

            if (policyId === null) {
                throw new Error("Could not retrieve Policy ID from transaction receipt.");
            }

            bot.sendMessage(chatId, 
`✅ Policy application submitted successfully!
Policy ID: ${policyId.toString()}
Asset Insured: ${assetToInsure}
Coverage Amount: ${ethers.utils.formatUnits(desiredCoverage, 18)} InzoUSD
Premium Due: ${ethers.utils.formatUnits(premiumAmount, 18)} InzoUSD
Status: Pending Application (Awaiting Premium Payment)

To activate your policy, pay the premium using: /pay_premium ${policyId.toString()}`);
            
            delete userPolicyApplications[userId]; // Clear application state

        } catch (error) {
            console.error("Error creating policy after Tavus call:", error.response?.data || error.message, error.stack);
            bot.sendMessage(chatId, "An error occurred while creating your policy on-chain. Please try applying again with /apply_policy. If the issue persists, contact support.");
            delete userPolicyApplications[userId];
        }
    });

    bot.onText(/\/my_policies/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!userKycState[userId]?.inzoWalletAddress) {
            bot.sendMessage(chatId, "You need to complete KYC (/kyc) and have an Inzo Wallet to view policies.");
            return;
        }
        const userInzoWallet = userKycState[userId].inzoWalletAddress;

        try {
            const policyIds = await blockchain.policyLedgerContract.getUserPolicyIds(userInzoWallet);
            if (policyIds.length === 0) {
                bot.sendMessage(chatId, "You currently have no insurance policies with Inzo. You can apply for one using /apply_policy.");
                return;
            }

            let message = "📜 Your Inzo Insurance Policies:\n\n";
            const statusMap = ["PendingApplication", "Active", "Expired", "Cancelled", "ClaimUnderReview", "ClaimPaid", "ClaimRejected"];

            for (const idBigNum of policyIds) {
                const id = idBigNum.toNumber(); // Assuming policy IDs are within JavaScript's safe integer range
                try {
                    // Fetch essential details in one call
                    const [, , statusNum, coverage] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(id);
                    const assetId = await blockchain.policyLedgerContract.getPolicyAssetIdentifier(id);
                    
                    message += `📄 Policy ID: ${id}\n`;
                    message += `   Asset: ${assetId}\n`;
                    message += `   Status: ${statusMap[statusNum] || 'Unknown'}\n`;
                    message += `   Coverage: ${ethers.utils.formatUnits(coverage, 18)} InzoUSD\n`;
                    message += `   View Details: /view_policy ${id}\n`;
                    if (statusNum === 0) { // PendingApplication
                        message += `   Pay Premium: /pay_premium ${id}\n`;
                    } else if (statusNum === 1) { // Active
                         message += `   File Claim: /file_claim ${id}\n`;
                    }
                    message += `\n`;

                } catch (e) {
                    message += `📄 Policy ID: ${id} (Error fetching details for this policy)\n\n`;
                    console.error(`Error fetching details for policy ID ${id} in /my_policies:`, e);
                }
            }
            bot.sendMessage(chatId, message);
        } catch (error) {
            console.error("Error fetching /my_policies:", error);
            bot.sendMessage(chatId, "Could not retrieve your policies at this time. Please try again later.");
        }
    });

    bot.onText(/\/view_policy (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const policyIdStr = match[1];
        const policyId = parseInt(policyIdStr);

        if (isNaN(policyId) || policyId <= 0) {
            bot.sendMessage(chatId, "Invalid Policy ID. Please provide a positive number.");
            return;
        }

        try {
            const [essPolicyId, holder, statusNum, coverage] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(policyId);
            const [premium, lastPremiumPaidDate, riskNum, startDate, endDate] = await blockchain.policyLedgerContract.getPolicyFinancialAndDateTerms(policyId); // Assuming a combined getter
            const assetId = await blockchain.policyLedgerContract.getPolicyAssetIdentifier(policyId);
            const policyDetailsHash = await blockchain.policyLedgerContract.getPolicyDetailsHash(policyId);

            const statusMap = ["PendingApplication", "Active", "Expired", "Cancelled", "ClaimUnderReview", "ClaimPaid", "ClaimRejected"];
            const riskMap = ["Standard", "Preferred", "HighRisk"]; // Match your contract's enum

            let policyInfo = `--- Policy Details: ID ${essPolicyId.toString()} ---\n`;
            policyInfo += `Policy Holder: ${holder}\n`;
            policyInfo += `Asset Insured: ${assetId}\n`;
            policyInfo += `Status: ${statusMap[statusNum] || 'N/A'}\n`;
            policyInfo += `Risk Tier: ${riskMap[riskNum] || 'N/A'}\n`;
            policyInfo += `Coverage Amount: ${ethers.utils.formatUnits(coverage, 18)} InzoUSD\n`;
            policyInfo += `Premium: ${ethers.utils.formatUnits(premium, 18)} InzoUSD\n`;
            policyInfo += `Policy Start Date: ${new Date(startDate.toNumber() * 1000).toLocaleDateString()}\n`;
            policyInfo += `Policy End Date: ${new Date(endDate.toNumber() * 1000).toLocaleDateString()}\n`;
            if (lastPremiumPaidDate.toNumber() > 0) {
                 policyInfo += `Last Premium Paid: ${new Date(lastPremiumPaidDate.toNumber() * 1000).toLocaleDateString()}\n`;
            }
            policyInfo += `Policy Terms Hash: ${policyDetailsHash}\n`;
            
            // Add action buttons based on status
            if (statusNum === 0) { // PendingApplication
                policyInfo += `\nTo activate: /pay_premium ${policyId}`;
            } else if (statusNum === 1) { // Active
                policyInfo += `\nTo file a claim: /file_claim ${policyId}`;
            }

            bot.sendMessage(chatId, policyInfo);

        } catch (e) {
            console.error(`Error viewing policy ID ${policyId}:`, e);
            bot.sendMessage(chatId, `Could not retrieve details for policy ID: ${policyId}. It might not exist or there was an error.`);
        }
    });

    bot.onText(/\/pay_premium (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const policyIdStr = match[1];
        const policyId = parseInt(policyIdStr);

        if (isNaN(policyId) || policyId <= 0) {
            bot.sendMessage(chatId, "Invalid Policy ID.");
            return;
        }
        if (!userKycState[userId]?.inzoWalletPk) { // Check for PK as bot manages transfers
            bot.sendMessage(chatId, "Your Inzo Wallet is not set up for bot-managed payments, or KYC is incomplete. Please use /kyc.");
            return;
        }

        try {
            const [, policyHolder, currentStatus,] = await blockchain.policyLedgerContract.getPolicyEssentialDetails(policyId);
            // Assuming getPolicyFinancialTerms exists and returns premiumAmount as the first element
            const [premiumAmount, ,] = await blockchain.policyLedgerContract.getPolicyFinancialAndDateTerms(policyId); // Or a dedicated getter for premium

            if (policyHolder !== userKycState[userId].inzoWalletAddress) {
                bot.sendMessage(chatId, "This policy does not belong to you. You cannot pay its premium.");
                return;
            }
            if (currentStatus !== 0 ) { // 0 is PendingApplication
                const statusMap = ["PendingApplication", "Active", "Expired", "Cancelled", "ClaimUnderReview", "ClaimPaid", "ClaimRejected"];
                bot.sendMessage(chatId, `This policy is not awaiting premium payment. Current status: ${statusMap[currentStatus] || 'Unknown'}`);
                return; 
            }

            const inzoUserWallet = new ethers.Wallet(userKycState[userId].inzoWalletPk, blockchain.provider);
            const inzoUSDForUserWallet = blockchain.inzoUSDContract.connect(inzoUserWallet);

            const userBalance = await inzoUSDForUserWallet.balanceOf(inzoUserWallet.address);
            if (userBalance.lt(premiumAmount)) {
                bot.sendMessage(chatId, `Insufficient InzoUSD to pay the premium. You need ${ethers.utils.formatUnits(premiumAmount, 18)} InzoUSD, but you only have ${ethers.utils.formatUnits(userBalance, 18)} InzoUSD.`);
                return;
            }

            const wndBalance = await blockchain.provider.getBalance(inzoUserWallet.address);
            if (wndBalance.lt(ethers.utils.parseEther("0.2"))) { // Gas check
                bot.sendMessage(chatId, `⚠️ Your WND balance for gas fees is low (less than 0.2 WND). Please add more WND to your wallet: ${inzoUserWallet.address} to ensure the transaction succeeds.`);
            }

            bot.sendMessage(chatId, `Approving the Insurance Fund Manager to spend ${ethers.utils.formatUnits(premiumAmount, 18)} InzoUSD for your premium...`);
            let tx = await inzoUSDForUserWallet.approve(blockchain.insuranceFundManagerContract.address, premiumAmount);
            await tx.wait();
            bot.sendMessage(chatId, "Approval successful. Now collecting the premium...");

            // Premium collection is often initiated by a trusted address (clientOrchestratorWallet)
            // It pulls funds from user (already approved) and updates policy status.
            tx = await blockchain.insuranceFundManagerContract.connect(blockchain.clientOrchestratorWallet).collectPremium(policyId, inzoUserWallet.address, premiumAmount);
            await tx.wait();
            bot.sendMessage(chatId, "Premium successfully collected by the Insurance Fund Manager.");

            // Update policy status to Active
            tx = await blockchain.policyLedgerContract.connect(blockchain.clientOrchestratorWallet).updatePolicyStatus(policyId, 1); // 1 for Active
            await tx.wait();
            
            bot.sendMessage(chatId, `✅ Premium paid! Policy ID ${policyId.toString()} is now Active! You can view it with /view_policy ${policyId}.`);

        } catch (e) {
            console.error(`Error paying premium for policy ${policyId}:`, e.response?.data || e.message, e.stack);
            bot.sendMessage(chatId, "Premium payment failed. Please check the error details in the console or contact support.");
        }
    });
}

module.exports = { registerPolicyHandlers, applicationQuestions };
