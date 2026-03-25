const { publishLinkedInQueueItem } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, badRequest } = require('./_lib/http');

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
        const item = await publishLinkedInQueueItem(queueItemId);
        return json(200, { success: item.status === 'published', item });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, { success: false, error: 'Failed to publish queue item', details: error.message });
    }
};
