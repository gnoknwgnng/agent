const { updateLinkedInQueueItem } = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, badRequest, parseJsonBody } = require('./_lib/http');

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
        const payload = parseJsonBody(event);
        const item = await updateLinkedInQueueItem(queueItemId, payload);
        return json(200, { success: true, item });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: 'Failed to update queue item',
            details: error.message
        });
    }
};
