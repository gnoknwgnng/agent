require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const LinkedInPostGenerator = require('./linkedinPostGenerator');
const { readState, writeState, createId } = require('./services/publishingStore');
const { createScheduleAndQueue, publishQueueItem, startScheduler } = require('./services/schedulerService');

const app = express();
const port = process.env.PORT || 3000;
const oauthStates = new Map();

function getLinkedInOAuthConfig() {
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${port}/auth/linkedin/callback`;
    return {
        clientId: process.env.LINKEDIN_CLIENT_ID || '',
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
        redirectUri,
        scope: process.env.LINKEDIN_SCOPE || 'openid profile email w_member_social'
    };
}

function isLinkedInOAuthConfigured() {
    const config = getLinkedInOAuthConfig();
    return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function createOAuthState() {
    return crypto.randomBytes(24).toString('hex');
}

function filterLinkedInState(state) {
    const linkedInAccounts = (state.accounts || []).filter((item) => item.platform === 'linkedin');
    const linkedInAccountIds = new Set(linkedInAccounts.map((item) => item.id));
    const linkedInSchedules = (state.schedules || []).filter((item) =>
        item.platform === 'linkedin' && linkedInAccountIds.has(item.accountId)
    );
    const linkedInScheduleIds = new Set(linkedInSchedules.map((item) => item.id));
    const linkedInQueue = (state.queue || []).filter((item) =>
        item.platform === 'linkedin' &&
        linkedInAccountIds.has(item.accountId) &&
        linkedInScheduleIds.has(item.scheduleId)
    );

    return {
        accounts: linkedInAccounts,
        schedules: linkedInSchedules,
        queue: linkedInQueue
    };
}

async function fetchLinkedInUserInfo(accessToken) {
    try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        return response.data || {};
    } catch (error) {
        return {};
    }
}

async function upsertLinkedInOAuthAccount({ accessToken, expiresIn, profile }) {
    const memberId = profile.sub || '';
    const authorUrn = memberId ? `urn:li:person:${memberId}` : '';

    if (!authorUrn) {
        throw new Error('LinkedIn login succeeded but the profile did not include a member ID.');
    }

    const state = await readState();
    const now = new Date().toISOString();
    const displayName = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(' ') || 'LinkedIn User';
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + (Number(expiresIn) * 1000)).toISOString() : '';

    const existingAccount = state.accounts.find((account) =>
        account.platform === 'linkedin' && (
            account.authorUrn === authorUrn ||
            (memberId && account.linkedinMemberId === memberId)
        )
    );

    const accountData = {
        platform: 'linkedin',
        displayName,
        accessToken,
        authorUrn,
        linkedinMemberId: memberId,
        email: profile.email || '',
        profilePicture: profile.picture || '',
        authType: 'oauth',
        status: 'connected',
        createdAt: existingAccount?.createdAt || now,
        updatedAt: now,
        tokenExpiresAt
    };

    if (existingAccount) {
        Object.assign(existingAccount, accountData);
        await writeState(state);
        return existingAccount;
    }

    const account = {
        id: createId('account'),
        ...accountData
    };

    state.accounts.push(account);
    await writeState(state);
    return account;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize generator
const generator = new LinkedInPostGenerator();

// Routes
app.get('/api', (req, res) => {
    res.json({
        message: 'LinkedIn Post Generator API',
        endpoints: {
            '/generate': 'POST - Generate LinkedIn post calendar',
            '/countries': 'GET - Get available countries',
            '/holidays/:year/:country': 'GET - Get holidays for specific year and country',
            '/publishing/accounts': 'GET/POST - Manage connected publishing accounts',
            '/publishing/schedules': 'GET/POST - Manage weekly publishing schedules',
            '/publishing/queue': 'GET - View scheduled and published queue items',
            '/publishing/providers': 'GET - View publishing provider configuration status',
            '/auth/linkedin/start': 'GET - Start LinkedIn OAuth login',
            '/auth/linkedin/callback': 'GET - Complete LinkedIn OAuth login'
        }
    });
});

app.get('/publishing/overview', async (req, res) => {
    try {
        const state = await readState();
        res.json({ success: true, ...filterLinkedInState(state) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load publishing overview' });
    }
});

app.get('/publishing/accounts', async (req, res) => {
    try {
        const state = await readState();
        res.json({ success: true, accounts: filterLinkedInState(state).accounts });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load accounts' });
    }
});

app.get('/publishing/providers', (req, res) => {
    const linkedInConfig = getLinkedInOAuthConfig();
    res.json({
        success: true,
        providers: {
            linkedin: {
                oauthConfigured: isLinkedInOAuthConfigured(),
                redirectUri: linkedInConfig.redirectUri,
                scope: linkedInConfig.scope
            }
        }
    });
});

app.post('/publishing/accounts', async (req, res) => {
    try {
        const {
            platform,
            displayName,
            accessToken,
            authorUrn
        } = req.body;

        if (!platform || !displayName || !accessToken) {
            return res.status(400).json({ success: false, error: 'platform, displayName, and accessToken are required' });
        }

        if (platform !== 'linkedin') {
            return res.status(400).json({ success: false, error: 'Only linkedin accounts are supported.' });
        }

        const state = await readState();
        const account = {
            id: createId('account'),
            platform,
            displayName,
            accessToken,
            authorUrn: authorUrn || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'connected'
        };

        state.accounts.push(account);
        await writeState(state);
        res.json({ success: true, account });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save account', details: error.message });
    }
});

app.get('/auth/linkedin/start', (req, res) => {
    if (!isLinkedInOAuthConfigured()) {
        return res.status(500).send('LinkedIn OAuth is not configured on this server.');
    }

    const config = getLinkedInOAuthConfig();
    const state = createOAuthState();
    oauthStates.set(state, {
        provider: 'linkedin',
        createdAt: Date.now()
    });

    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', config.scope);

    res.redirect(authUrl.toString());
});

app.get('/auth/linkedin/callback', async (req, res) => {
    const {
        code,
        state,
        error,
        error_description: errorDescription
    } = req.query;

    if (error) {
        return res.redirect(`/publisher.html?linkedin=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || 'LinkedIn authorization failed')}`);
    }

    if (!code || !state || !oauthStates.has(state)) {
        return res.redirect('/publisher.html?linkedin=invalid_state');
    }

    const oauthState = oauthStates.get(state);
    oauthStates.delete(state);

    if (!oauthState || oauthState.provider !== 'linkedin' || (Date.now() - oauthState.createdAt) > (10 * 60 * 1000)) {
        return res.redirect('/publisher.html?linkedin=expired_state');
    }

    try {
        const config = getLinkedInOAuthConfig();
        const tokenParams = new URLSearchParams();
        tokenParams.set('grant_type', 'authorization_code');
        tokenParams.set('code', String(code));
        tokenParams.set('redirect_uri', config.redirectUri);
        tokenParams.set('client_id', config.clientId);
        tokenParams.set('client_secret', config.clientSecret);

        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            tokenParams.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data?.access_token;
        const expiresIn = tokenResponse.data?.expires_in;

        if (!accessToken) {
            throw new Error('LinkedIn token exchange did not return an access token.');
        }

        const profile = await fetchLinkedInUserInfo(accessToken);
        await upsertLinkedInOAuthAccount({
            accessToken,
            expiresIn,
            profile
        });

        res.redirect('/publisher.html?linkedin=connected');
    } catch (callbackError) {
        const errorMessage = callbackError.response?.data?.error_description || callbackError.response?.data?.error || callbackError.message;
        res.redirect(`/publisher.html?linkedin=failed&message=${encodeURIComponent(errorMessage)}`);
    }
});

app.get('/publishing/schedules', async (req, res) => {
    try {
        const state = await readState();
        res.json({ success: true, schedules: filterLinkedInState(state).schedules });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedules' });
    }
});

app.post('/publishing/schedules', async (req, res) => {
    try {
        const {
            platform,
            accountId,
            postsPerWeek,
            companyName,
            website,
            industry,
            services,
            countryCode,
            preferredHour,
            startDate,
            endDate
        } = req.body;

        if (!platform || !accountId || !postsPerWeek || !companyName || !industry) {
            return res.status(400).json({ success: false, error: 'platform, accountId, postsPerWeek, companyName, and industry are required' });
        }

        if (platform !== 'linkedin') {
            return res.status(400).json({ success: false, error: 'Only linkedin schedules are supported.' });
        }

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            return res.status(400).json({ success: false, error: 'endDate must be on or after startDate' });
        }

        const normalizedServices = Array.isArray(services)
            ? services
            : String(services || '').split('\n').map((item) => item.trim()).filter(Boolean);

        const result = await createScheduleAndQueue({
            platform,
            accountId,
            postsPerWeek: Number(postsPerWeek),
            companyName,
            website,
            industry,
            services: normalizedServices,
            countryCode,
            preferredHour: Number(preferredHour || 10),
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : undefined
        });

        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create schedule', details: error.message });
    }
});

app.get('/publishing/queue', async (req, res) => {
    try {
        const state = await readState();
        res.json({ success: true, queue: filterLinkedInState(state).queue });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load queue' });
    }
});

app.post('/publishing/queue/:id/publish', async (req, res) => {
    try {
        const state = await readState();
        const existingItem = state.queue.find((item) => item.id === req.params.id);
        if (!existingItem) {
            return res.status(404).json({ success: false, error: 'Queue item not found' });
        }

        if (existingItem.platform !== 'linkedin') {
            return res.status(400).json({ success: false, error: 'Only linkedin queue items can be published.' });
        }

        const item = await publishQueueItem(req.params.id);
        res.json({ success: item.status === 'published', item });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to publish queue item', details: error.message });
    }
});

// Get available countries
app.get('/countries', async (req, res) => {
    try {
        const countries = await generator.getAvailableCountries();
        res.json(countries);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch countries' });
    }
});

// Get holidays for specific year and country
app.get('/holidays/:year/:country', async (req, res) => {
    try {
        const { year, country } = req.params;
        const holidays = await generator.getHolidays(parseInt(year), country.toUpperCase());
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays' });
    }
});

// Get model status
app.get('/model-status', (req, res) => {
    try {
        const status = generator.getModelStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get model status' });
    }
});

// Reset model failures
app.post('/reset-models', (req, res) => {
    try {
        generator.resetModelFailures();
        res.json({
            success: true,
            message: 'Model failures reset successfully',
            currentModel: generator.getCurrentModel()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset models' });
    }
});

// Shared handler so local Express can mirror the Netlify function routes.
const improvePostHandler = async (req, res) => {
    try {
        const {
            currentPost,
            userRequest,
            postType,
            holiday,
            postTypeCategory,
            companyInfo
        } = req.body;

        // Validate required fields
        if (!currentPost || !userRequest) {
            return res.status(400).json({
                error: 'currentPost and userRequest are required'
            });
        }

        generator.setPlatform('linkedin');
        const platformName = generator.getPlatformConfig().name;

        // Create improvement prompt
        const improvementPrompt = `You are a professional ${platformName} content expert. A user wants to improve their ${platformName} post.

Current Post:
"${currentPost}"

Post Context:
- Type: ${postType} ${holiday ? `(Holiday: ${holiday})` : `(Category: ${postTypeCategory})`}
- Company: ${companyInfo?.name || 'Unknown'}
- Industry: ${companyInfo?.industry || 'Business'}

User Request: "${userRequest}"

Please provide:
1. A brief explanation of what you'll improve (2-3 sentences)
2. An improved version of the post that addresses their request

Keep the improved post professional, engaging, and suitable for ${platformName}. Maintain the original structure and key information while implementing the requested changes.

Format your response as:
EXPLANATION: [Your explanation here]
IMPROVED_POST: [The improved post here]`;

        // Generate improvement using AI
        const aiResponse = await generator.generateContentWithAI(improvementPrompt);

        if (aiResponse) {
            // Parse the AI response
            const explanationMatch = aiResponse.match(/EXPLANATION:\s*(.*?)(?=IMPROVED_POST:|$)/s);
            const improvedPostMatch = aiResponse.match(/IMPROVED_POST:\s*(.*)/s);

            const explanation = explanationMatch ? explanationMatch[1].trim() : "I've improved your post based on your request.";
            const improvedPost = improvedPostMatch ? improvedPostMatch[1].trim() : aiResponse;

            res.json({
                success: true,
                explanation: explanation,
                improvedPost: improvedPost,
                originalPost: currentPost
            });
        } else {
            throw new Error('AI service unavailable');
        }
    } catch (error) {
        console.error('Error improving post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to improve post',
            details: error.message
        });
    }
};

// Improve existing post with AI
app.post('/improve-post', improvePostHandler);
app.post('/.netlify/functions/improve-post', improvePostHandler);

// Shared handler so the frontend can use the same path locally and on Netlify.
const generateCalendarHandler = async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            countryCode = 'US',
            companyName,
            website,
            industry,
            services,
            format = 'json'
        } = req.body;

        // Validate required fields
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'startDate and endDate are required'
            });
        }

        // Process services - convert string to array if needed
        let processedServices = services;
        if (typeof services === 'string') {
            processedServices = services.split('\n').filter(s => s.trim()).map(s => s.trim());
        } else if (!Array.isArray(services)) {
            processedServices = [];
        }

        const selectedPlatform = 'linkedin';
        generator.setPlatform(selectedPlatform);

        // Set company information
        await generator.setCompanyInfo(companyName, website, processedServices, industry);

        // Generate calendar
        const calendar = await generator.generateCalendar(startDate, endDate, countryCode);

        // Return in requested format
        if (format === 'text') {
            res.set('Content-Type', 'text/plain');
            res.send(generator.exportToText(calendar));
        } else {
            res.json({
                success: true,
                platform: selectedPlatform,
                dateRange: { startDate, endDate },
                countryCode,
                totalPosts: calendar.length,
                calendar: calendar
            });
        }
    } catch (error) {
        console.error('Error generating calendar:', error);
        res.status(500).json({
            error: 'Failed to generate calendar',
            details: error.message
        });
    }
};

// Generate LinkedIn post calendar
app.post('/generate', generateCalendarHandler);
app.post('/.netlify/functions/generate', generateCalendarHandler);

// Start server
app.listen(port, () => {
    console.log(`LinkedIn Post Generator API running on port ${port}`);
    console.log(`Visit http://localhost:${port} for API documentation`);
});

startScheduler();

module.exports = app;
