const crypto = require('crypto');
const axios = require('axios');
const { readState, saveAccount, createId } = require('./publishingStore');

function trimTrailingSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function getSiteUrl(options = {}) {
    const configuredUrl = trimTrailingSlash(process.env.PUBLIC_SITE_URL);

    if (configuredUrl) {
        return configuredUrl;
    }

    const headers = options.headers || {};
    const host = headers['x-forwarded-host'] || headers.host || '';
    const protocol = headers['x-forwarded-proto'] || (host && host.includes('localhost') ? 'http' : 'https');

    if (host) {
        return `${protocol}://${host}`;
    }

    const netlifyUrl = trimTrailingSlash(
        process.env.SITE_URL ||
        process.env.URL ||
        process.env.DEPLOY_PRIME_URL ||
        process.env.DEPLOY_URL
    );

    if (netlifyUrl) {
        return netlifyUrl;
    }

    return trimTrailingSlash(options.defaultUrl || 'http://localhost:8888');
}

function getLinkedInOAuthConfig(options = {}) {
    const siteUrl = getSiteUrl(options);
    return {
        clientId: String(process.env.LINKEDIN_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.LINKEDIN_CLIENT_SECRET || '').trim(),
        redirectUri: String(
            process.env.LINKEDIN_REDIRECT_URI ||
            `${siteUrl}/.netlify/functions/linkedin-oauth-callback`
        ).trim(),
        scope: String(process.env.LINKEDIN_SCOPE || 'openid profile email w_member_social').trim(),
        siteUrl
    };
}

function isLinkedInOAuthConfigured(options = {}) {
    const config = getLinkedInOAuthConfig(options);
    return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function getStateSecret(config) {
    return String(process.env.LINKEDIN_OAUTH_STATE_SECRET || config.clientSecret || '').trim();
}

function toBase64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function signStatePayload(encodedPayload, config) {
    return crypto
        .createHmac('sha256', getStateSecret(config))
        .update(encodedPayload)
        .digest('base64url');
}

function createOAuthStateToken(config) {
    const payload = {
        provider: 'linkedin',
        nonce: crypto.randomBytes(24).toString('hex'),
        issuedAt: Date.now()
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = signStatePayload(encodedPayload, config);
    return `${encodedPayload}.${signature}`;
}

function verifyOAuthStateToken(stateToken, config) {
    if (!stateToken || !stateToken.includes('.')) {
        return false;
    }

    const [encodedPayload, signature] = stateToken.split('.');
    const expectedSignature = signStatePayload(encodedPayload, config);

    if (signature.length !== expectedSignature.length) {
        return false;
    }

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return false;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (payload.provider !== 'linkedin') {
            return false;
        }

        return Date.now() - Number(payload.issuedAt || 0) <= (10 * 60 * 1000);
    } catch (error) {
        return false;
    }
}

async function fetchLinkedInUserInfo(accessToken) {
    try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        return response.data || {};
    } catch (error) {
        return {};
    }
}

async function upsertLinkedInOAuthAccount({ accessToken, expiresIn, profile }) {
    const memberId = profile.sub || '';
    const authorUrn = memberId ? `urn:li:person:${memberId}` : '';

    if (!authorUrn) {
        throw new Error('LinkedIn login succeeded but the profile did not include a member ID.');
    }

    const state = await readState();
    const now = new Date().toISOString();
    const displayName = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(' ') || 'LinkedIn User';
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + (Number(expiresIn) * 1000)).toISOString() : '';

    const existingAccount = state.accounts.find((account) =>
        account.platform === 'linkedin' && (
            account.authorUrn === authorUrn ||
            (memberId && account.linkedinMemberId === memberId)
        )
    );

    const account = {
        id: existingAccount?.id || createId('account'),
        platform: 'linkedin',
        displayName,
        accessToken,
        authorUrn,
        linkedinMemberId: memberId,
        email: profile.email || '',
        profilePicture: profile.picture || '',
        authType: 'oauth',
        status: 'connected',
        createdAt: existingAccount?.createdAt || now,
        updatedAt: now,
        tokenExpiresAt
    };

    await saveAccount(account);
    return account;
}

module.exports = {
    getSiteUrl,
    getLinkedInOAuthConfig,
    isLinkedInOAuthConfigured,
    createOAuthStateToken,
    verifyOAuthStateToken,
    fetchLinkedInUserInfo,
    upsertLinkedInOAuthAccount
};
