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

const PENDING_CONTENT_PLACEHOLDER = 'Content will be generated automatically when this scheduled item is published.';
const ROTATING_POST_TYPES = ['service', 'tip', 'motivation', 'ai_tool'];

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

async function createGeneratorForSchedule(schedule) {
    const generator = new LinkedInPostGenerator();
    generator.setPlatform(schedule.platform);
    await generator.setCompanyInfo(
        schedule.companyName,
        schedule.website,
        schedule.services,
        schedule.industry,
        { skipAiHashtags: true }
    );
    return generator;
}

async function loadHolidaysByYear(generator, slots, countryCode) {
    const years = [...new Set(slots.map((slot) => new Date(slot).getFullYear()))];
    const entries = await Promise.all(
        years.map(async (year) => [year, await generator.getHolidays(year, countryCode || 'US')])
    );

    return new Map(entries);
}

function needsQueueContent(queueItem) {
    return (
        !queueItem.content ||
        queueItem.content === PENDING_CONTENT_PLACEHOLDER ||
        queueItem.metadata?.contentStatus === 'pending_generation'
    );
}

async function generateQueueContent(generator, schedule, scheduledFor, postType, holidaysByYear) {
    const scheduledDate = new Date(scheduledFor);
    const holidays = holidaysByYear.get(scheduledDate.getFullYear()) || [];
    const holiday = generator.findHolidayForDate(scheduledDate, holidays);
    const generatedPost = holiday
        ? await generator.generateFestivalPost(scheduledDate, holiday, { skipAi: true })
        : await generator.generateBusinessPost(scheduledDate, postType, { skipAi: true });

    return {
        content: generatedPost || PENDING_CONTENT_PLACEHOLDER,
        metadata: {
            type: holiday ? 'festival' : 'business',
            holiday: holiday?.name || null,
            postType: holiday ? null : postType,
            contentStatus: generatedPost ? 'generated' : 'pending_generation',
            generatedAt: generatedPost ? new Date().toISOString() : null,
            generationMode: 'fast_template'
        }
    };
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
    const slots = buildScheduleSlots(
        schedule.postsPerWeek,
        schedule.startDate,
        schedule.endDate,
        schedule.preferredHour || 10
    );
    if (!slots.length) {
        return [];
    }

    const generator = await createGeneratorForSchedule(schedule);
    const holidaysByYear = await loadHolidaysByYear(generator, slots, schedule.countryCode);

    const queueItems = [];
    for (let index = 0; index < slots.length; index += 1) {
        const scheduledFor = slots[index];
        const postType = ROTATING_POST_TYPES[index % ROTATING_POST_TYPES.length];
        const generated = await generateQueueContent(
            generator,
            schedule,
            scheduledFor,
            postType,
            holidaysByYear
        );

        queueItems.push({
            id: createId('queue'),
            scheduleId: schedule.id,
            accountId: schedule.accountId,
            platform: schedule.platform,
            status: 'scheduled',
            scheduledFor: scheduledFor.toISOString(),
            createdAt: new Date().toISOString(),
            content: generated.content,
            mediaUrl: schedule.defaultImageUrl || '',
            recipientPhone: schedule.defaultRecipientPhone || '',
            metadata: generated.metadata
        });
    }

    return queueItems;
}

async function generateContentForQueueItem(queueItem, schedule) {
    const generator = await createGeneratorForSchedule(schedule);
    const holidaysByYear = await loadHolidaysByYear(
        generator,
        [new Date(queueItem.scheduledFor)],
        schedule.countryCode
    );
    const fallbackPostType = queueItem.metadata?.postType || ROTATING_POST_TYPES[0];
    const generatedItem = await generateQueueContent(
        generator,
        schedule,
        queueItem.scheduledFor,
        fallbackPostType,
        holidaysByYear
    );

    queueItem.content = generatedItem.content;
    queueItem.metadata = {
        ...queueItem.metadata,
        ...generatedItem.metadata
    };

    return queueItem;
}

async function hydratePendingQueueItems(queueItems, schedules) {
    const pendingItems = (queueItems || []).filter((item) =>
        item.platform === 'linkedin' && needsQueueContent(item)
    );

    if (!pendingItems.length) {
        return queueItems;
    }

    const schedulesById = new Map((schedules || []).map((schedule) => [schedule.id, schedule]));
    const pendingBySchedule = new Map();

    for (const item of pendingItems) {
        const collection = pendingBySchedule.get(item.scheduleId) || [];
        collection.push(item);
        pendingBySchedule.set(item.scheduleId, collection);
    }

    for (const [scheduleId, items] of pendingBySchedule.entries()) {
        const schedule = schedulesById.get(scheduleId);
        if (!schedule) {
            continue;
        }

        const generator = await createGeneratorForSchedule(schedule);
        const holidaysByYear = await loadHolidaysByYear(
            generator,
            items.map((item) => new Date(item.scheduledFor)),
            schedule.countryCode
        );

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const fallbackPostType = item.metadata?.postType || ROTATING_POST_TYPES[index % ROTATING_POST_TYPES.length];
            const generated = await generateQueueContent(
                generator,
                schedule,
                item.scheduledFor,
                fallbackPostType,
                holidaysByYear
            );

            item.content = generated.content;
            item.metadata = {
                ...(item.metadata || {}),
                ...generated.metadata
            };
            item.updatedAt = new Date().toISOString();
            await saveQueueItem(item);
        }
    }

    return queueItems;
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

    const schedule = state.schedules.find((item) => item.id === queueItem.scheduleId);
    if (!schedule) {
        throw new Error('Publishing schedule not found for this queue item.');
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
        if (!queueItem.content || queueItem.metadata?.contentStatus === 'pending_generation' || queueItem.content === PENDING_CONTENT_PLACEHOLDER) {
            await generateContentForQueueItem(queueItem, schedule);
        }

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
    generateContentForQueueItem,
    hydratePendingQueueItems,
    publishQueueItem,
    publishDueQueueItems,
    startScheduler
};
