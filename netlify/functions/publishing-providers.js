const { getLinkedInProviderStatus } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed } = require('./_lib/http');
const { requireAuthenticatedUser } = require('./_lib/auth');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    try {
        await requireAuthenticatedUser(event);
        return json(200, {
            success: true,
            providers: getLinkedInProviderStatus({ headers: event.headers || {} })
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: statusCode === 401 ? error.message : 'Failed to load provider status',
            details: statusCode === 401 ? undefined : error.message
        });
    }
};
