const { getLinkedInOAuthConfig, isLinkedInOAuthConfigured, createOAuthStateToken } = require('../../services/oauthService');
const { redirect, handleOptions, methodNotAllowed, text } = require('./_lib/http');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    const config = getLinkedInOAuthConfig({ headers: event.headers || {} });
    if (!isLinkedInOAuthConfigured({ headers: event.headers || {} })) {
        return text(500, 'LinkedIn OAuth is not configured on this site.');
    }

    const state = createOAuthStateToken(config);
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', config.scope);

    return redirect(authUrl.toString());
};
