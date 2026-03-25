const LinkedInPostGenerator = require('../../linkedinPostGenerator');

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        console.log('Function called with body:', event.body);
        
        const {
            startDate,
            endDate,
            countryCode = 'US',
            companyName,
            website,
            industry,
            services,
            format = 'json'
        } = JSON.parse(event.body);
        
        console.log('Parsed data:', { startDate, endDate, countryCode, companyName, industry });

        // Validate required fields
        if (!startDate || !endDate) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'startDate and endDate are required'
                })
            };
        }

        // Initialize generator
        console.log('Initializing generator...');
        const generator = new LinkedInPostGenerator();
        const selectedPlatform = 'linkedin';
        generator.setPlatform(selectedPlatform);
        console.log('Generator initialized successfully');

        // Process services - convert string to array if needed
        let processedServices = services;
        if (typeof services === 'string') {
            processedServices = services.split('\n').filter(s => s.trim()).map(s => s.trim());
        } else if (!Array.isArray(services)) {
            processedServices = [];
        }

        // Set company information
        await generator.setCompanyInfo(companyName, website, processedServices, industry);

        // Generate calendar
        const calendar = await generator.generateCalendar(startDate, endDate, countryCode);

        // Return in requested format
        if (format === 'text') {
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'text/plain'
                },
                body: generator.exportToText(calendar)
            };
        } else {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    platform: selectedPlatform,
                    dateRange: { startDate, endDate },
                    countryCode,
                    totalPosts: calendar.length,
                    calendar: calendar
                })
            };
        }
    } catch (error) {
        console.error('Error generating calendar:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to generate calendar',
                details: error.message
            })
        };
    }
};
