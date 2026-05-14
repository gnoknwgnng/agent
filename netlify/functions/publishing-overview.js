const { getLinkedInOverview } = require('../../services/publishingApi');
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
        const overview = await getLinkedInOverview(getUserContext(user));
        return json(200, { success: true, ...overview });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return json(statusCode, {
            success: false,
            error: statusCode === 401 ? error.message : 'Failed to load publishing overview',
            details: statusCode === 401 ? undefined : error.message
        });
    }
};
