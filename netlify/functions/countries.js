const LinkedInPostGenerator = require('../../linkedinPostGenerator');
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
        const generator = new LinkedInPostGenerator();
        const countries = await generator.getAvailableCountries();
        return json(200, countries);
    } catch (error) {
        return json(500, { error: 'Failed to fetch countries', details: error.message });
    }
};
