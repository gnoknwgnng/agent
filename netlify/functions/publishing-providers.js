const { getLinkedInProviderStatus } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed } = require('./_lib/http');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    try {
        return json(200, {
            success: true,
            providers: getLinkedInProviderStatus({ headers: event.headers || {} })
        });
    } catch (error) {
        return json(500, { success: false, error: 'Failed to load provider status', details: error.message });
    }
};
