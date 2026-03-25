const baseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function buildHeaders(extraHeaders = {}) {
    return {
        ...baseHeaders,
        ...extraHeaders
    };
}

function json(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: buildHeaders({
            'Content-Type': 'application/json',
            ...extraHeaders
        }),
        body: JSON.stringify(body)
    };
}

function text(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: buildHeaders({
            'Content-Type': 'text/plain; charset=utf-8',
            ...extraHeaders
        }),
        body: body || ''
    };
}

function redirect(location, statusCode = 302) {
    return {
        statusCode,
        headers: buildHeaders({
            Location: location
        }),
        body: ''
    };
}

function handleOptions(event) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: buildHeaders(),
            body: ''
        };
    }

    return null;
}

function methodNotAllowed() {
    return json(405, { error: 'Method not allowed' });
}

function badRequest(message) {
    return json(400, { success: false, error: message });
}

function parseJsonBody(event) {
    try {
        return JSON.parse(event.body || '{}');
    } catch (error) {
        const parseError = new Error('Invalid JSON body');
        parseError.statusCode = 400;
        throw parseError;
    }
}

module.exports = {
    json,
    text,
    redirect,
    handleOptions,
    methodNotAllowed,
    badRequest,
    parseJsonBody
};
