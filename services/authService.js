const axios = require('axios');

function trimTrailingSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function getSupabaseAuthConfig() {
    return {
        supabaseUrl: trimTrailingSlash(process.env.SUPABASE_URL),
        anonKey: String(
            process.env.SUPABASE_ANON_KEY ||
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            ''
        ).trim(),
        serviceRoleKey: String(
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_SECRET_KEY ||
            process.env.SUPABASE_SERVICE_KEY ||
            ''
        ).trim()
    };
}

function isSupabaseAuthConfigured() {
    const config = getSupabaseAuthConfig();
    return Boolean(config.supabaseUrl && (config.anonKey || config.serviceRoleKey));
}

function createAuthError(message, statusCode = 401) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function extractBearerToken(headers = {}) {
    const authHeader = headers.authorization || headers.Authorization || '';
    const [scheme, token] = String(authHeader).trim().split(/\s+/);

    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return '';
    }

    return token;
}

async function verifySupabaseAccessToken(accessToken) {
    const token = String(accessToken || '').trim();
    if (!token) {
        throw createAuthError('Missing bearer token', 401);
    }

    const config = getSupabaseAuthConfig();
    const apiKey = config.anonKey || config.serviceRoleKey;

    if (!config.supabaseUrl || !apiKey) {
        throw createAuthError('Supabase Auth environment variables are not configured on the server.', 500);
    }

    try {
        const response = await axios.get(`${config.supabaseUrl}/auth/v1/user`, {
            headers: {
                apikey: apiKey,
                Authorization: `Bearer ${token}`
            }
        });

        const user = response.data || {};
        const userId = String(user.id || '').trim();

        if (!userId) {
            throw createAuthError('Authenticated user is missing an id.', 401);
        }

        return {
            id: userId,
            email: String(user.email || '').trim(),
            user
        };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }

        const statusCode = error.response?.status;
        if (statusCode === 401 || statusCode === 403) {
            throw createAuthError('Invalid or expired session. Please sign in again.', 401);
        }

        const message = error.response?.data?.msg || error.response?.data?.message || error.message;
        throw createAuthError(`Unable to validate session: ${message}`, 500);
    }
}

module.exports = {
    getSupabaseAuthConfig,
    isSupabaseAuthConfigured,
    extractBearerToken,
    verifySupabaseAccessToken,
    createAuthError
};
