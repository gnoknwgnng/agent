const { readState, saveAccount, updateQueueItem, createId } = require('./publishingStore');
const {
    createScheduleAndQueue,
    publishQueueItem,
    publishDueQueueItems,
    hydratePendingQueueItems
} = require('./schedulerService');
const { getLinkedInOAuthConfig, isLinkedInOAuthConfigured } = require('./oauthService');

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

function normalizeServicesInput(services) {
    if (Array.isArray(services)) {
        return services.map((item) => String(item || '').trim()).filter(Boolean);
    }

    return String(services || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function requireUserContext(userContext = {}) {
    const userId = String(userContext.userId || '').trim();
    if (!userId) {
        const error = new Error('Authentication required. Please sign in first.');
        error.statusCode = 401;
        throw error;
    }

    return { userId, userEmail: String(userContext.userEmail || '').trim() };
}

async function getLinkedInOverview(userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    const linkedInState = filterLinkedInState(state);
    await hydratePendingQueueItems(linkedInState.queue, linkedInState.schedules, context);
    return linkedInState;
}

async function getLinkedInAccounts(userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    return filterLinkedInState(state).accounts;
}

async function getLinkedInSchedules(userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    return filterLinkedInState(state).schedules;
}

async function getLinkedInQueue(userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    const linkedInState = filterLinkedInState(state);
    await hydratePendingQueueItems(linkedInState.queue, linkedInState.schedules, context);
    return linkedInState.queue;
}

async function createManualLinkedInAccount(payload, userContext = {}) {
    const context = requireUserContext(userContext);
    const {
        platform,
        displayName,
        accessToken,
        authorUrn
    } = payload;

    if (!platform || !displayName || !accessToken) {
        throw new Error('platform, displayName, and accessToken are required');
    }

    if (platform !== 'linkedin') {
        throw new Error('Only linkedin accounts are supported.');
    }

    const account = {
        id: createId('account'),
        userId: context.userId,
        platform,
        displayName,
        accessToken,
        authorUrn: authorUrn || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'connected'
    };

    await saveAccount(account, context);
    return account;
}

function getLinkedInProviderStatus(options = {}) {
    const linkedInConfig = getLinkedInOAuthConfig(options);
    return {
        linkedin: {
            oauthConfigured: isLinkedInOAuthConfigured(options),
            redirectUri: linkedInConfig.redirectUri,
            scope: linkedInConfig.scope
        }
    };
}

async function createLinkedInSchedule(payload, userContext = {}) {
    const context = requireUserContext(userContext);
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
    } = payload;

    if (!platform || !accountId || !postsPerWeek || !companyName || !industry) {
        throw new Error('platform, accountId, postsPerWeek, companyName, and industry are required');
    }

    if (platform !== 'linkedin') {
        throw new Error('Only linkedin schedules are supported.');
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        throw new Error('endDate must be on or after startDate');
    }

    return createScheduleAndQueue({
        platform,
        accountId,
        postsPerWeek: Number(postsPerWeek),
        companyName,
        website,
        industry,
        services: normalizeServicesInput(services),
        countryCode,
        preferredHour: Number(preferredHour || 10),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : undefined
    }, context);
}

async function publishLinkedInQueueItem(queueItemId, userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    const existingItem = state.queue.find((item) => item.id === queueItemId);
    if (!existingItem) {
        const error = new Error('Queue item not found');
        error.statusCode = 404;
        throw error;
    }

    if (existingItem.platform !== 'linkedin') {
        const error = new Error('Only linkedin queue items can be published.');
        error.statusCode = 400;
        throw error;
    }

    return publishQueueItem(queueItemId, context);
}

async function updateLinkedInQueueItem(queueItemId, payload, userContext = {}) {
    const context = requireUserContext(userContext);
    const state = await readState(context);
    const existingItem = state.queue.find((item) => item.id === queueItemId);
    if (!existingItem) {
        const error = new Error('Queue item not found');
        error.statusCode = 404;
        throw error;
    }

    if (existingItem.platform !== 'linkedin') {
        const error = new Error('Only linkedin queue items can be updated.');
        error.statusCode = 400;
        throw error;
    }

    const nextContent = String(payload.content || '').trim();
    if (!nextContent) {
        const error = new Error('content is required');
        error.statusCode = 400;
        throw error;
    }

    const metadata = {
        ...(existingItem.metadata || {}),
        ...(payload.metadata || {}),
        contentStatus: 'edited',
        editedAt: new Date().toISOString()
    };

    const updatedItem = {
        ...existingItem,
        content: nextContent,
        metadata,
        updatedAt: new Date().toISOString()
    };

    await updateQueueItem(queueItemId, {
        content: updatedItem.content,
        metadata: updatedItem.metadata,
        updatedAt: updatedItem.updatedAt
    }, context);

    return updatedItem;
}

async function runScheduledQueuePublish(options = {}) {
    return publishDueQueueItems(options, { scope: 'all' });
}

module.exports = {
    filterLinkedInState,
    getLinkedInOverview,
    getLinkedInAccounts,
    getLinkedInSchedules,
    getLinkedInQueue,
    createManualLinkedInAccount,
    getLinkedInProviderStatus,
    createLinkedInSchedule,
    publishLinkedInQueueItem,
    updateLinkedInQueueItem,
    runScheduledQueuePublish
};
