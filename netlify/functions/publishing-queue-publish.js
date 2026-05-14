const { publishLinkedInQueueItem } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, badRequest } = require('./_lib/http');
const { requireAuthenticatedUser, getUserContext } = require('./_lib/auth');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    if (event.httpMethod !== 'POST') {
        return methodNotAllowed();
    }

    const queueItemId = event.queryStringParameters?.id;
    if (!queueItemId) {
        return badRequest('Queue item id is required');
    }

    try {
        const user = await requireAuthenticatedUser(event);
        const item = await publishLinkedInQueueItem(queueItemId, getUserContext(user));
        return json(200, { success: item.status === 'published', item });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: statusCode === 401 ? error.message : 'Failed to publish queue item',
            details: statusCode === 401 ? undefined : error.message
        });
    }
};
