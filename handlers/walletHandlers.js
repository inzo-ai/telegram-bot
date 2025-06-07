// handlers/walletHandlers.js
const { ethers } = require("ethers");
const { userKycState } = require('../store/userState');
const blockchain = require('../services/blockchainService');

function registerWalletHandlers(bot) {
    bot.onText(/\/my_wallet/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!userKycState[userId]?.inzoWalletAddress) {
            bot.sendMessage(chatId, "You don't have an Inzo Wallet yet. Please complete the KYC process using /kyc.");
            return;
        }

        const { inzoWalletAddress } = userKycState[userId];
        try {
            const wndBalance = await blockchain.provider.getBalance(inzoWalletAddress);
            const inzoUSDBalance = await blockchain.inzoUSDContract.balanceOf(inzoWalletAddress);

            bot.sendMessage(chatId, 
`🏦 Your Inzo Wallet:
Address: ${inzoWalletAddress}
WND Balance: ${ethers.utils.formatEther(wndBalance)} WND
InzoUSD Balance: ${ethers.utils.formatUnits(inzoUSDBalance, 18)} InzoUSD

To transfer InzoUSD: /transfer_inzousd <recipient_address> <amount>`
            );
        } catch (e) {
            console.error("Error fetching wallet balances:", e);
            bot.sendMessage(chatId, "Sorry, there was an error fetching your wallet balances. Please try again later.");
        }
    });

    bot.onText(/\/transfer_inzousd (.+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const toAddress = match[1];
        const amountStr = match[2];

        if (!userKycState[userId]?.inzoWalletPk) { // Check for PK as bot manages the transfer
            bot.sendMessage(chatId, "Your Inzo Wallet is not fully set up for bot-managed transfers, or you haven't completed KYC. Please use /kyc.");
            return;
        }
        if (!ethers.utils.isAddress(toAddress)) {
            bot.sendMessage(chatId, "Invalid recipient address. Please provide a valid Ethereum-style address.");
            return;
        }

        let amount;
        try {
            amount = ethers.utils.parseUnits(amountStr, 18); // InzoUSD has 18 decimals
            if (amount.lte(0)) throw new Error("Amount must be positive");
        } catch (e) {
            bot.sendMessage(chatId, "Invalid amount. Please enter a positive number (e.g., 100.50).");
            return;
        }

        try {
            const inzoUserWallet = new ethers.Wallet(userKycState[userId].inzoWalletPk, blockchain.provider);
            const inzoUSDForUserWallet = blockchain.inzoUSDContract.connect(inzoUserWallet);

            const balance = await inzoUSDForUserWallet.balanceOf(inzoUserWallet.address);
            if (balance.lt(amount)) {
                bot.sendMessage(chatId, `Insufficient InzoUSD balance. You have: ${ethers.utils.formatUnits(balance, 18)} InzoUSD.`);
                return;
            }

            const wndBalance = await blockchain.provider.getBalance(inzoUserWallet.address);
            // Rough gas check - actual gas can vary. This is a simple warning.
            if (wndBalance.lt(ethers.utils.parseEther("0.1"))) { // Adjust threshold as needed
                bot.sendMessage(chatId, `⚠️ Warning: Your WND balance for gas fees is low. Please add WND to ${inzoUserWallet.address} to ensure transactions succeed.`);
            }

            bot.sendMessage(chatId, `🚀 Attempting to transfer ${amountStr} InzoUSD to ${toAddress}...`);
            const tx = await inzoUSDForUserWallet.transfer(toAddress, amount);
            await tx.wait(); // Wait for the transaction to be mined

            bot.sendMessage(chatId, `✅ Successfully transferred ${amountStr} InzoUSD to ${toAddress}.\nTransaction Hash: ${tx.hash}`);
        } catch (e) {
            console.error("Transfer InzoUSD error:", e.response?.data || e.message);
            bot.sendMessage(chatId, "Transfer failed. Please check the console for details or try again later.");
        }
    });
}

module.exports = { registerWalletHandlers };
