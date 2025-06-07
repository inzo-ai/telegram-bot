// store/userState.js
const userKycState = {}; // Stores KYC progress for each user
const userPolicyApplications = {}; // Stores policy application data
const userClaimData = {}; // Stores claim-specific data

module.exports = {
    userKycState,
    userPolicyApplications,
    userClaimData,
};
