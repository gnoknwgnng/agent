const { updateLinkedInQueueItem } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, badRequest, parseJsonBody } = require('./_lib/http');
const { requireAuthenticatedUser, getUserContext } = require('./_lib/auth');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'PATCH') {
        return methodNotAllowed();
    }

    const queueItemId = event.queryStringParameters?.id;
    if (!queueItemId) {
        return badRequest('Queue item id is required');
    }

    try {
        const user = await requireAuthenticatedUser(event);
        const payload = parseJsonBody(event);
        const item = await updateLinkedInQueueItem(queueItemId, payload, getUserContext(user));
        return json(200, { success: true, item });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: statusCode === 401 ? error.message : 'Failed to update queue item',
            details: statusCode === 401 ? undefined : error.message
        });
    }
};
