const { getLinkedInOAuthConfig, isLinkedInOAuthConfigured, createOAuthStateToken } = require('../../services/oauthService');
const { redirect, handleOptions, methodNotAllowed, text } = require('./_lib/http');
const { requireAuthenticatedUser } = require('./_lib/auth');
const { verifySupabaseAccessToken } = require('../../services/authService');

async function resolveUser(event) {
    try {
        return await requireAuthenticatedUser(event);
    } catch (error) {
        const tokenFromQuery = String(event.queryStringParameters?.access_token || '').trim();
        if (!tokenFromQuery) {
            throw error;
        }

        return verifySupabaseAccessToken(tokenFromQuery);
    }
}

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    try {
        const user = await resolveUser(event);
        const config = getLinkedInOAuthConfig({ headers: event.headers || {} });
        if (!isLinkedInOAuthConfigured({ headers: event.headers || {} })) {
            return text(500, 'LinkedIn OAuth is not configured on this site.');
        }

        const state = createOAuthStateToken(config, {
            userId: user.id,
            returnTo: '/publisher.html'
        });

        const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', config.clientId);
        authUrl.searchParams.set('redirect_uri', config.redirectUri);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('scope', config.scope);

        return redirect(authUrl.toString());
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return text(statusCode, statusCode === 401 ? error.message : `Failed to start LinkedIn OAuth: ${error.message}`);
    }
};
