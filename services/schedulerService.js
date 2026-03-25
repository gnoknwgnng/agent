const {
    readState,
    saveSchedule,
    saveQueueItems,
    saveQueueItem,
    updateQueueItemStatus,
    createId
} = require('./publishingStore');
const { publishToPlatform } = require('./platformPublishers');
const LinkedInPostGenerator = require('../linkedinPostGenerator');

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function formatDate(date) {
    return new Date(date).toISOString().split('T')[0];
}

function formatPublishError(error) {
    const responseData = error.response?.data;

    if (typeof responseData === 'string' && responseData.trim()) {
        return {
            message: responseData,
            status: error.response?.status || null
        };
    }

    if (responseData && typeof responseData === 'object') {
        const parts = [responseData.title, responseData.detail].filter(Boolean);
        return {
            message: parts.length ? parts.join(': ') : JSON.stringify(responseData),
            status: error.response?.status || null
        };
    }

    return {
        message: error.message,
        status: error.response?.status || null
    };
}

function buildScheduleSlots(postsPerWeek, startDate, endDate, preferredHour) {
    const slots = [];
    const scheduleStart = startOfDay(startDate);
    const scheduleEnd = endOfDay(endDate);
    let weekStart = new Date(scheduleStart);

    while (weekStart <= scheduleEnd) {
        for (let i = 0; i < postsPerWeek; i++) {
            const dayOffset = i % 7;
            const slotOffset = Math.floor(i / 7);
            const scheduled = new Date(weekStart);
            scheduled.setDate(scheduled.getDate() + dayOffset);
            scheduled.setHours(preferredHour + (slotOffset * 4), 0, 0, 0);

            if (scheduled >= scheduleStart && scheduled <= scheduleEnd) {
                slots.push(scheduled);
            }
        }

        weekStart = addDays(weekStart, 7);
    }

    return slots.sort((a, b) => a.getTime() - b.getTime());
}

async function generateQueueItemsForSchedule(schedule) {
    const generator = new LinkedInPostGenerator();
    generator.setPlatform(schedule.platform);
    await generator.setCompanyInfo(
        schedule.companyName,
        schedule.website,
        schedule.services,
        schedule.industry
    );

    const calendar = await generator.generateCalendar(
        formatDate(schedule.startDate),
        formatDate(schedule.endDate),
        schedule.countryCode || 'US'
    );

    const calendarByDate = new Map(calendar.map((item) => [item.date, item]));
    const slots = buildScheduleSlots(
        schedule.postsPerWeek,
        schedule.startDate,
        schedule.endDate,
        schedule.preferredHour || 10
    );

    return slots.map((scheduledFor, index) => {
        const scheduledDate = formatDate(scheduledFor);
        const contentSource = calendarByDate.get(scheduledDate) || calendar[index % calendar.length];
        return {
            id: createId('queue'),
            scheduleId: schedule.id,
            accountId: schedule.accountId,
            platform: schedule.platform,
            status: 'scheduled',
            scheduledFor: scheduledFor.toISOString(),
            createdAt: new Date().toISOString(),
            content: contentSource.post,
            mediaUrl: schedule.defaultImageUrl || '',
            recipientPhone: schedule.defaultRecipientPhone || '',
            metadata: {
                type: contentSource.type,
                holiday: contentSource.holiday || null,
                postType: contentSource.postType || null
            }
        };
    });
}

async function createScheduleAndQueue(payload) {
    if (payload.platform !== 'linkedin') {
        throw new Error('Only linkedin schedules are supported.');
    }

    const state = await readState();
    const account = state.accounts.find((item) => item.id === payload.accountId);
    if (!account) {
        throw new Error('Connected account not found.');
    }

    if (account.platform !== payload.platform) {
        throw new Error('Selected account does not match the chosen publishing platform.');
    }

    const normalizedStartDate = startOfDay(payload.startDate || new Date());
    const normalizedEndDate = endOfDay(payload.endDate || addDays(normalizedStartDate, 27));

    if (normalizedEndDate < normalizedStartDate) {
        throw new Error('End date must be on or after the start date.');
    }

    const schedule = {
        id: createId('schedule'),
        platform: payload.platform,
        accountId: payload.accountId,
        companyName: payload.companyName,
        website: payload.website || '',
        industry: payload.industry,
        services: payload.services || [],
        countryCode: payload.countryCode || 'US',
        postsPerWeek: payload.postsPerWeek,
        preferredHour: payload.preferredHour || 10,
        startDate: normalizedStartDate.toISOString(),
        endDate: normalizedEndDate.toISOString(),
        defaultImageUrl: payload.defaultImageUrl || '',
        defaultRecipientPhone: payload.defaultRecipientPhone || '',
        active: true,
        createdAt: new Date().toISOString()
    };

    const queueItems = await generateQueueItemsForSchedule({
        ...schedule,
        startDate: new Date(schedule.startDate),
        endDate: new Date(schedule.endDate)
    });

    await saveSchedule(schedule);
    await saveQueueItems(queueItems);

    return { schedule, queueItems };
}

async function publishQueueItem(queueItemId) {
    const state = await readState();
    const queueItem = state.queue.find((item) => item.id === queueItemId);

    if (!queueItem) {
        throw new Error('Queue item not found.');
    }

    if (queueItem.platform !== 'linkedin') {
        throw new Error('Only linkedin queue items can be published.');
    }

    const account = state.accounts.find((item) => item.id === queueItem.accountId);
    if (!account) {
        throw new Error('Connected account not found for this queue item.');
    }

    if (queueItem.status === 'published') {
        return queueItem;
    }

    queueItem.status = 'publishing';
    queueItem.updatedAt = new Date().toISOString();
    await updateQueueItemStatus(queueItem.id, {
        status: queueItem.status,
        updatedAt: queueItem.updatedAt
    });

    try {
        const result = await publishToPlatform(queueItem.platform, account, queueItem);
        queueItem.status = 'published';
        queueItem.publishedAt = new Date().toISOString();
        queueItem.providerId = result.providerId;
        queueItem.providerResponse = result.providerResponse;
        queueItem.error = null;
        queueItem.errorStatus = null;
    } catch (error) {
        const publishError = formatPublishError(error);
        queueItem.status = 'failed';
        queueItem.error = publishError.message;
        queueItem.errorStatus = publishError.status;
    }

    queueItem.updatedAt = new Date().toISOString();
    await saveQueueItem(queueItem);
    return queueItem;
}

async function publishDueQueueItems(options = {}) {
    const limit = Number(options.limit || 20);
    const now = options.now ? new Date(options.now) : new Date();
    const state = await readState();

    const dueItems = state.queue
        .filter((item) =>
            item.platform === 'linkedin' &&
            item.status === 'scheduled' &&
            new Date(item.scheduledFor).getTime() <= now.getTime()
        )
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
        .slice(0, limit);

    const items = [];
    for (const item of dueItems) {
        items.push(await publishQueueItem(item.id));
    }

    return {
        processedCount: items.length,
        publishedCount: items.filter((item) => item.status === 'published').length,
        failedCount: items.filter((item) => item.status === 'failed').length,
        items
    };
}

let schedulerStarted = false;

function startScheduler() {
    if (schedulerStarted) {
        return;
    }

    schedulerStarted = true;
    setInterval(async () => {
        try {
            await publishDueQueueItems();
        } catch (error) {
            console.error('Scheduler error:', error.message);
        }
    }, 30000);
}

module.exports = {
    createScheduleAndQueue,
    generateQueueItemsForSchedule,
    publishQueueItem,
    publishDueQueueItems,
    startScheduler
};
