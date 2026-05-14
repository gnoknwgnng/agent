const {
    getLinkedInSchedules,
    createLinkedInSchedule
} = require('../../services/publishingApi');
const { json, handleOptions, methodNotAllowed, parseJsonBody } = require('./_lib/http');
const { requireAuthenticatedUser, getUserContext } = require('./_lib/auth');

exports.handler = async (event) => {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
        return optionsResponse;
    }

    try {
        const user = await requireAuthenticatedUser(event);
        const userContext = getUserContext(user);

        if (event.httpMethod === 'GET') {
            const schedules = await getLinkedInSchedules(userContext);
            return json(200, { success: true, schedules });
        }

        if (event.httpMethod === 'POST') {
            const payload = parseJsonBody(event);
            const result = await createLinkedInSchedule(payload, userContext);
            return json(200, { success: true, ...result });
        }

        return methodNotAllowed();
    } catch (error) {
        const statusCode = error.statusCode || (event.httpMethod === 'POST' ? 400 : 500);
        const message = statusCode === 401
            ? error.message
            : event.httpMethod === 'POST'
                ? 'Failed to create schedule'
                : 'Failed to load schedules';

        return json(statusCode, { success: false, error: message, details: statusCode === 401 ? undefined : error.message });
    }
};
