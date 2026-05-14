const { json, handleOptions, methodNotAllowed } = require('./_lib/http');
const { getSupabaseAuthConfig } = require('../../services/authService');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    const { supabaseUrl, anonKey } = getSupabaseAuthConfig();

    if (!supabaseUrl || !anonKey) {
        return json(500, {
            success: false,
            error: 'Supabase public auth configuration is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.'
        });
    }

    return json(200, {
        success: true,
        supabaseUrl,
        supabaseAnonKey: anonKey
    });
};
