const {
    getLinkedInSchedules,
    createLinkedInSchedule
} = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, parseJsonBody } = require('./_lib/http');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    try {
        if (event.httpMethod === 'GET') {
            const schedules = await getLinkedInSchedules();
            return json(200, { success: true, schedules });
        }

        if (event.httpMethod === 'POST') {
            const payload = parseJsonBody(event);
            const result = await createLinkedInSchedule(payload);
            return json(200, { success: true, ...result });
        }

        return methodNotAllowed();
    } catch (error) {
        const statusCode = error.statusCode || (event.httpMethod === 'POST' ? 400 : 500);
        const message = event.httpMethod === 'POST'
            ? 'Failed to create schedule'
            : 'Failed to load schedules';

        return json(statusCode, { success: false, error: message, details: error.message });
    }
};
