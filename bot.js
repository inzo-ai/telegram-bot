// bot.js
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
// Blockchain service is initialized internally, imported where needed by handlers.

// Handlers
const { registerCommonHandlers } = require('./handlers/commonHandlers');
const { registerKycHandlers } = require('./handlers/kycHandlers');
const { registerWalletHandlers } = require('./handlers/walletHandlers');
const { registerPolicyHandlers } = require('./handlers/policyHandlers');
const { registerClaimHandlers } = require('./handlers/claimHandlers');

// Initialize Telegram Bot
const bot = new TelegramBot(config.botToken, { polling: true });
console.log("Inzo Telegram Bot started...");

// Register all command and message handlers
registerCommonHandlers(bot);
registerKycHandlers(bot);
registerWalletHandlers(bot);
registerPolicyHandlers(bot);
registerClaimHandlers(bot);


// Error Handling
bot.on('polling_error', (error) => {
    console.error("Telegram Polling Error:", error.code ? `${error.code} - ${error.message}` : error.message);
    // More sophisticated error handling can be added here, e.g., conditional restart or notification
});

bot.on('webhook_error', (error) => {
    console.error("Telegram Webhook Error:", error.code ? `${error.code} - ${error.message}` : error.message);
});

console.log("All handlers registered. Bot is operational.");

// Graceful shutdown
process.once('SIGINT', () => {
    console.log("SIGINT received. Stopping bot...");
    bot.stopPolling().then(() => {
        console.log("Bot stopped polling.");
        process.exit(0);
    });
});

process.once('SIGTERM', () => {
    console.log("SIGTERM received. Stopping bot...");
    bot.stopPolling().then(() => {
        console.log("Bot stopped polling.");
        process.exit(0);
    });
});
