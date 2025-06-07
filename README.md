# Inzo Intelligent Insurance Telegram Bot

Try Hosted Demo- https://t.me/inzoaibot

## Core Functionalities

*   **KYC Process:**
    *   Document and selfie verification via Persona.
    *   AI agent video interview via Tavus.
    *   On-chain KYC status update.
*   **Inzo Wallet Management:**
    *   Creation of a unique Inzo Wallet for each KYC-verified user.
    *   Initial minting of demo InzoUSD.
    *   Check balances (WND for gas, InzoUSD).
    *   Transfer InzoUSD between wallets (bot-managed for demo purposes).
*   **Policy Management:**
    *   Apply for new insurance policies (with text-based questions and a Tavus AI agent call).
    *   View existing policies.
    *   Pay premiums for pending policies to activate them.
*   **Claim Management:**
    *   File claims for active policies (includes an AI agent investigation call via Tavus).
    *   Claim decisions are requested from an external AI Oracle.
    *   The bot polls for the Oracle's on-chain decision and processes payouts or rejections accordingly.

## Prerequisites

*   [Node.js](https://nodejs.org/) (v16.x or later recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)
*   Access to the required API keys and contract details (see `.env.example`).
*   Deployed smart contracts (PolicyLedger, ClaimOracleRelay, InzoUSD, InsuranceFundManager) on a compatible EVM network (e.g., Westend Asset Hub as per original config).
*   ABI files for the smart contracts.

## Setup

1.  **Clone the repository (if applicable):**
    ```bash
    git clone https://github.com/inzo-ai/telegram-bot
    cd telegram-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create ABI directory:**
    Create an `abi/` directory in the root of the project and place your smart contract ABI JSON files there (Get these from - https://github.com/inzo-ai/new-contracts)
    *   `claimOracleRelay.abi.json`
    *   `inzoUSD.abi.json`
    *   `insuranceFundManager.abi.json`
    *   `policyLedger.abi.json`

4.  **Set up environment variables:**
    Create a `.env` file in the root of the project:

    ```env
    # Telegram Bot
    BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

    # Tavus AI Video Agent
    TAVUS_API_KEY=YOUR_TAVUS_API_KEY
    TAVUS_REPLICA_ID_KYC=your_tavus_replica_id_for_kyc_calls
    TAVUS_REPLICA_ID_POLICY=your_tavus_replica_id_for_policy_calls
    TAVUS_REPLICA_ID_CLAIM=your_tavus_replica_id_for_claim_calls

    # Persona KYC
    PERSONA_API_KEY=YOUR_PERSONA_API_KEY

    # Blockchain & Wallets
    ORACLE_PRIVATE_KEY=YOUR_ORACLE_WALLET_PRIVATE_KEY
    DEPLOYER_PRIVATE_KEY=YOUR_CLIENT_ORCHESTRATOR_WALLET_PRIVATE_KEY
    WESTEND_ASSET_HUB_RPC_URL=YOUR_EVM_COMPATIBLE_RPC_URL

    # Smart Contract Addresses
    CLAIMORACLERELAY_CONTRACT_ADDRESS=YOUR_CLAIMORACLERELAY_CONTRACT_ADDRESS
    POLICYLEDGER_CONTRACT_ADDRESS=YOUR_POLICYLEDGER_CONTRACT_ADDRESS
    INZOUSD_CONTRACT_ADDRESS=YOUR_INZOUSD_CONTRACT_ADDRESS
    INSURANCEFUNDMANAGER_CONTRACT_ADDRESS=YOUR_INSURANCEFUNDMANAGER_CONTRACT_ADDRESS

    # External AI Oracle for Claim Decisions
    GEMINI_ORACLE_ENDPOINT=https://geminioraclesetup.vercel.app/api/decide_claim # Or your oracle endpoint
    ```

## Running the Bot

Once the setup is complete, you can start the bot using:

```bash

node bot.js

```

The bot will connect to Telegram and start listening for commands.



#Project Structure



The project is organized into several directories to separate concerns:

abi/: Contains smart contract ABI JSON files.

config/: Handles loading and validation of environment variables.

handlers/: Contains the logic for different bot commands and message types (KYC, wallet, policy, claims, common).

services/: Houses clients for interacting with external APIs (Persona, Tavus, Gemini Oracle) and blockchain services (ethers.js setup, contract instances).

store/: Manages in-memory user state (e.g., KYC progress, active applications).

utils/: Contains general utility functions.

bot.js: The main entry point that initializes the bot and registers handlers.

Important Notes

Security: The bot stores user private keys in memory for demo purposes to manage their Inzo Wallets. This is NOT secure for a production environment. In a real application, users would manage their own private keys using a proper wallet solution.

Error Handling: Basic error handling is in place, but it can be further enhanced for robustness.

External Oracle: The claim decision process relies on an external AI Oracle service available at the GEMINI_ORACLE_ENDPOINT. This service is responsible for receiving claim details, making a decision (simulated AI approval), and then calling the submitClaimDecision function on the ClaimOracleRelay smart contract.

Test Network: This bot is designed to work with a test EVM network where WND is used for gas and InzoUSD is a custom ERC20 token.

