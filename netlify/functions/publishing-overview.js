const { getLinkedInOverview } = require('../../services/publishingApi');
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
        const overview = await getLinkedInOverview();
        return json(200, { success: true, ...overview });
    } catch (error) {
        return json(500, { success: false, error: 'Failed to load publishing overview', details: error.message });
    }
};
