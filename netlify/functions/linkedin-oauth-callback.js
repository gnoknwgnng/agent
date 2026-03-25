const axios = require('axios');
const {
    getLinkedInOAuthConfig,
    verifyOAuthStateToken,
    fetchLinkedInUserInfo,
    upsertLinkedInOAuthAccount
} = require('../../services/oauthService');
const { redirect, handleOptions, methodNotAllowed } = require('./_lib/http');

function buildPublisherRedirect(siteUrl, params) {
    const redirectUrl = new URL('/publisher.html', siteUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            redirectUrl.searchParams.set(key, value);
        }
    });
    return redirectUrl.toString();
}

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    const config = getLinkedInOAuthConfig({ headers: event.headers || {} });
    const params = event.queryStringParameters || {};
    const { code, state, error, error_description: errorDescription } = params;

    if (error) {
        return redirect(buildPublisherRedirect(config.siteUrl, {
            linkedin: error,
            message: errorDescription || 'LinkedIn authorization failed'
        }));
    }

    if (!code || !verifyOAuthStateToken(state, config)) {
        return redirect(buildPublisherRedirect(config.siteUrl, { linkedin: 'invalid_state' }));
    }

    try {
        const tokenParams = new URLSearchParams();
        tokenParams.set('grant_type', 'authorization_code');
        tokenParams.set('code', String(code));
        tokenParams.set('redirect_uri', config.redirectUri);
        tokenParams.set('client_id', config.clientId);
        tokenParams.set('client_secret', config.clientSecret);

        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            tokenParams.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data?.access_token;
        const expiresIn = tokenResponse.data?.expires_in;

        if (!accessToken) {
            throw new Error('LinkedIn token exchange did not return an access token.');
        }

        const profile = await fetchLinkedInUserInfo(accessToken);
        await upsertLinkedInOAuthAccount({
            accessToken,
            expiresIn,
            profile
        });

        return redirect(buildPublisherRedirect(config.siteUrl, { linkedin: 'connected' }));
    } catch (callbackError) {
        const errorMessage = callbackError.response?.data?.error_description ||
            callbackError.response?.data?.error ||
            callbackError.message;

        return redirect(buildPublisherRedirect(config.siteUrl, {
            linkedin: 'failed',
            message: errorMessage
        }));
    }
};
