const { extractBearerToken, verifySupabaseAccessToken, createAuthError } = require('../../../services/authService');

async function requireAuthenticatedUser(event) {
    const token = extractBearerToken(event.headers || {});
    if (!token) {
        throw createAuthError('Authentication required. Please sign in first.', 401);
    }

    return verifySupabaseAccessToken(token);
}

function getUserContext(user) {
    return {
        userId: user.id,
        userEmail: user.email || ''
    };
}

module.exports = {
    requireAuthenticatedUser,
    getUserContext
};
