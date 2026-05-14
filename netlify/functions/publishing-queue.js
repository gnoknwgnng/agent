const { getLinkedInQueue } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed } = require('./_lib/http');
const { requireAuthenticatedUser, getUserContext } = require('./_lib/auth');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'GET') {
        return methodNotAllowed();
    }

    try {
        const user = await requireAuthenticatedUser(event);
        const queue = await getLinkedInQueue(getUserContext(user));
        return json(200, { success: true, queue });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: statusCode === 401 ? error.message : 'Failed to load queue',
            details: statusCode === 401 ? undefined : error.message
        });
    }
};
