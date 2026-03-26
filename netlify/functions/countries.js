const LinkedInPostGenerator = require('../../linkedinPostGenerator');
const { json, handleOptions, methodNotAllowed } = require('./_lib/http');

function ensureCountry(countries, code, name) {
    const normalizedCode = String(code || '').toUpperCase();
    if (!normalizedCode) {
        return countries;
    }

    const exists = countries.some((item) => String(item.countryCode || '').toUpperCase() === normalizedCode);
    if (exists) {
        return countries;
    }

    return [
        ...countries,
        {
            countryCode: normalizedCode,
            name
        }
    ];
}

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
        let countries = await generator.getAvailableCountries();
        countries = Array.isArray(countries) ? countries : [];
        countries = ensureCountry(countries, 'US', 'United States');
        countries = ensureCountry(countries, 'IN', 'India');
        return json(200, countries);
    } catch (error) {
        return json(500, { error: 'Failed to fetch countries', details: error.message });
    }
};
