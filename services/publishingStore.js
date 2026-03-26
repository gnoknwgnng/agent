const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');

const dataDir = path.join(__dirname, '..', 'data');
const statePath = path.join(dataDir, 'publishing-state.json');

const defaultState = {
    accounts: [],
    schedules: [],
    queue: []
};

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
).trim();
const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_REST_BASE = isSupabaseEnabled ? `${SUPABASE_URL}/rest/v1` : '';

function cloneDefaultState() {
    return JSON.parse(JSON.stringify(defaultState));
}

function supabaseHeaders(prefer = '') {
    const headers = {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };

    if (prefer) {
        headers.Prefer = prefer;
    }

    return headers;
}

function createSupabaseError(error, table) {
    const status = error.response?.status;
    const payload = error.response?.data || {};
    const code = payload.code ? ` ${payload.code}` : '';
    const details = payload.message || payload.error_description || payload.details || error.message;
    const missingTableHint = payload.code === '42P01'
        ? ` Table "${table}" does not exist yet. Run the SQL schema first.`
        : '';

    return new Error(`Supabase request failed for ${table} (${status || 'n/a'}${code}): ${details}.${missingTableHint}`);
}

function normalizeLinkedInState(state) {
    const accounts = (state.accounts || []).filter((item) => item.platform === 'linkedin');
    const accountIds = new Set(accounts.map((item) => item.id));

    const schedules = (state.schedules || []).filter((item) =>
        item.platform === 'linkedin' && accountIds.has(item.accountId)
    );
    const scheduleIds = new Set(schedules.map((item) => item.id));

    const queue = (state.queue || []).filter((item) =>
        item.platform === 'linkedin' &&
        accountIds.has(item.accountId) &&
        scheduleIds.has(item.scheduleId)
    );

    return { accounts, schedules, queue };
}

function toAccountRow(account) {
    return {
        id: account.id,
        platform: 'linkedin',
        display_name: account.displayName || 'LinkedIn User',
        access_token: account.accessToken || '',
        author_urn: account.authorUrn || '',
        linkedin_member_id: account.linkedinMemberId || null,
        email: account.email || null,
        profile_picture: account.profilePicture || null,
        auth_type: account.authType || 'oauth',
        status: account.status || 'connected',
        token_expires_at: account.tokenExpiresAt || null,
        created_at: account.createdAt || new Date().toISOString(),
        updated_at: account.updatedAt || new Date().toISOString()
    };
}

function toScheduleRow(schedule) {
    return {
        id: schedule.id,
        platform: 'linkedin',
        account_id: schedule.accountId,
        company_name: schedule.companyName || '',
        website: schedule.website || '',
        industry: schedule.industry || '',
        services: Array.isArray(schedule.services) ? schedule.services : [],
        country_code: schedule.countryCode || 'US',
        posts_per_week: Number(schedule.postsPerWeek || 7),
        preferred_hour: Number(schedule.preferredHour || 10),
        start_date: schedule.startDate || new Date().toISOString(),
        end_date: schedule.endDate || new Date().toISOString(),
        active: schedule.active !== false,
        created_at: schedule.createdAt || new Date().toISOString()
    };
}

function toQueueRow(item) {
    return {
        id: item.id,
        schedule_id: item.scheduleId,
        account_id: item.accountId,
        platform: 'linkedin',
        status: item.status || 'scheduled',
        scheduled_for: item.scheduledFor || new Date().toISOString(),
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: item.updatedAt || null,
        published_at: item.publishedAt || null,
        content: item.content || '',
        metadata: item.metadata || {},
        provider_id: item.providerId || null,
        provider_response: item.providerResponse || null,
        error: item.error || null,
        error_status: item.errorStatus || null
    };
}

function fromAccountRow(row) {
    return {
        id: row.id,
        platform: row.platform,
        displayName: row.display_name || '',
        accessToken: row.access_token || '',
        authorUrn: row.author_urn || '',
        linkedinMemberId: row.linkedin_member_id || '',
        email: row.email || '',
        profilePicture: row.profile_picture || '',
        authType: row.auth_type || '',
        status: row.status || '',
        tokenExpiresAt: row.token_expires_at || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function fromScheduleRow(row) {
    return {
        id: row.id,
        platform: row.platform,
        accountId: row.account_id,
        companyName: row.company_name || '',
        website: row.website || '',
        industry: row.industry || '',
        services: Array.isArray(row.services) ? row.services : [],
        countryCode: row.country_code || 'US',
        postsPerWeek: row.posts_per_week,
        preferredHour: row.preferred_hour,
        startDate: row.start_date,
        endDate: row.end_date,
        active: row.active,
        createdAt: row.created_at
    };
}

function fromQueueRow(row) {
    return {
        id: row.id,
        scheduleId: row.schedule_id,
        accountId: row.account_id,
        platform: row.platform,
        status: row.status,
        scheduledFor: row.scheduled_for,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
        content: row.content || '',
        metadata: row.metadata || {},
        providerId: row.provider_id,
        providerResponse: row.provider_response,
        error: row.error,
        errorStatus: row.error_status
    };
}

async function ensureStateFile() {
    await fs.mkdir(dataDir, { recursive: true });
    try {
        await fs.access(statePath);
    } catch (error) {
        await fs.writeFile(statePath, JSON.stringify(defaultState, null, 2), 'utf8');
    }
}

async function readLocalState() {
    await ensureStateFile();
    const raw = await fs.readFile(statePath, 'utf8');
    try {
        const parsed = JSON.parse(raw);
        return {
            accounts: parsed.accounts || [],
            schedules: parsed.schedules || [],
            queue: parsed.queue || []
        };
    } catch (error) {
        return cloneDefaultState();
    }
}

async function writeLocalState(state) {
    await ensureStateFile();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
    return state;
}

function toInFilter(ids) {
    return `in.(${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`;
}

function difference(sourceIds, keepIdsSet) {
    return sourceIds.filter((id) => !keepIdsSet.has(id));
}

function upsertRecord(list, record) {
    const index = list.findIndex((item) => item.id === record.id);
    if (index >= 0) {
        list[index] = record;
        return;
    }

    list.push(record);
}

async function fetchSupabaseRows(table, orderColumn) {
    try {
        const response = await axios.get(`${SUPABASE_REST_BASE}/${table}`, {
            params: {
                select: '*',
                order: `${orderColumn}.asc`
            },
            headers: supabaseHeaders()
        });
        return response.data || [];
    } catch (error) {
        throw createSupabaseError(error, table);
    }
}

async function fetchSupabaseIds(table) {
    try {
        const response = await axios.get(`${SUPABASE_REST_BASE}/${table}`, {
            params: { select: 'id' },
            headers: supabaseHeaders()
        });
        return (response.data || []).map((row) => row.id);
    } catch (error) {
        throw createSupabaseError(error, table);
    }
}

async function upsertSupabaseRows(table, rows) {
    if (!rows.length) {
        return;
    }

    try {
        await axios.post(`${SUPABASE_REST_BASE}/${table}`, rows, {
            params: { on_conflict: 'id' },
            headers: supabaseHeaders('resolution=merge-duplicates,return=minimal')
        });
    } catch (error) {
        throw createSupabaseError(error, table);
    }
}

async function deleteSupabaseRowsById(table, ids) {
    if (!ids.length) {
        return;
    }

    const chunkSize = 200;
    for (let index = 0; index < ids.length; index += chunkSize) {
        const chunk = ids.slice(index, index + chunkSize);
        try {
            await axios.delete(`${SUPABASE_REST_BASE}/${table}`, {
                params: { id: toInFilter(chunk) },
                headers: supabaseHeaders('return=minimal')
            });
        } catch (error) {
            throw createSupabaseError(error, table);
        }
    }
}

async function patchSupabaseRows(table, filters, patch) {
    try {
        await axios.patch(`${SUPABASE_REST_BASE}/${table}`, patch, {
            params: {
                ...filters
            },
            headers: supabaseHeaders('return=minimal')
        });
    } catch (error) {
        throw createSupabaseError(error, table);
    }
}

async function readSupabaseState() {
    const [accountRows, scheduleRows, queueRows] = await Promise.all([
        fetchSupabaseRows('accounts', 'created_at'),
        fetchSupabaseRows('schedules', 'created_at'),
        fetchSupabaseRows('queue_items', 'created_at')
    ]);

    return {
        accounts: accountRows.map(fromAccountRow),
        schedules: scheduleRows.map(fromScheduleRow),
        queue: queueRows.map(fromQueueRow)
    };
}

async function writeSupabaseState(state) {
    const normalized = normalizeLinkedInState(state);
    const accountRows = normalized.accounts.map(toAccountRow);
    const scheduleRows = normalized.schedules.map(toScheduleRow);
    const queueRows = normalized.queue.map(toQueueRow);

    const [existingAccountIds, existingScheduleIds, existingQueueIds] = await Promise.all([
        fetchSupabaseIds('accounts'),
        fetchSupabaseIds('schedules'),
        fetchSupabaseIds('queue_items')
    ]);

    await upsertSupabaseRows('accounts', accountRows);
    await upsertSupabaseRows('schedules', scheduleRows);
    await upsertSupabaseRows('queue_items', queueRows);

    const accountIdsSet = new Set(accountRows.map((row) => row.id));
    const scheduleIdsSet = new Set(scheduleRows.map((row) => row.id));
    const queueIdsSet = new Set(queueRows.map((row) => row.id));

    await deleteSupabaseRowsById('queue_items', difference(existingQueueIds, queueIdsSet));
    await deleteSupabaseRowsById('schedules', difference(existingScheduleIds, scheduleIdsSet));
    await deleteSupabaseRowsById('accounts', difference(existingAccountIds, accountIdsSet));

    return normalized;
}

async function readState() {
    if (isSupabaseEnabled) {
        return readSupabaseState();
    }
    return readLocalState();
}

async function writeState(state) {
    if (isSupabaseEnabled) {
        return writeSupabaseState(state);
    }
    return writeLocalState(state);
}

async function saveAccount(account) {
    if (isSupabaseEnabled) {
        await upsertSupabaseRows('accounts', [toAccountRow(account)]);
        return account;
    }

    const state = await readLocalState();
    upsertRecord(state.accounts, account);
    await writeLocalState(state);
    return account;
}

async function saveSchedule(schedule) {
    if (isSupabaseEnabled) {
        await upsertSupabaseRows('schedules', [toScheduleRow(schedule)]);
        return schedule;
    }

    const state = await readLocalState();
    upsertRecord(state.schedules, schedule);
    await writeLocalState(state);
    return schedule;
}

async function saveQueueItems(queueItems) {
    if (!Array.isArray(queueItems) || !queueItems.length) {
        return [];
    }

    if (isSupabaseEnabled) {
        await upsertSupabaseRows('queue_items', queueItems.map(toQueueRow));
        return queueItems;
    }

    const state = await readLocalState();
    queueItems.forEach((item) => upsertRecord(state.queue, item));
    await writeLocalState(state);
    return queueItems;
}

async function saveQueueItem(queueItem) {
    await saveQueueItems([queueItem]);
    return queueItem;
}

async function updateQueueItemStatus(queueItemId, patch) {
    if (isSupabaseEnabled) {
        const updatePayload = {};

        if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
            updatePayload.status = patch.status;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) {
            updatePayload.updated_at = patch.updatedAt;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'publishedAt')) {
            updatePayload.published_at = patch.publishedAt;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'providerId')) {
            updatePayload.provider_id = patch.providerId;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'providerResponse')) {
            updatePayload.provider_response = patch.providerResponse;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
            updatePayload.error = patch.error;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'errorStatus')) {
            updatePayload.error_status = patch.errorStatus;
        }

        await patchSupabaseRows('queue_items', { id: `eq.${queueItemId}` }, updatePayload);
        return queueItemId;
    }

    const state = await readLocalState();
    const queueItem = state.queue.find((item) => item.id === queueItemId);
    if (!queueItem) {
        return null;
    }

    Object.assign(queueItem, patch);
    await writeLocalState(state);
    return queueItem;
}

async function updateQueueItem(queueItemId, patch) {
    if (isSupabaseEnabled) {
        const updatePayload = {};

        if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
            updatePayload.status = patch.status;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) {
            updatePayload.updated_at = patch.updatedAt;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'publishedAt')) {
            updatePayload.published_at = patch.publishedAt;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'providerId')) {
            updatePayload.provider_id = patch.providerId;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'providerResponse')) {
            updatePayload.provider_response = patch.providerResponse;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
            updatePayload.error = patch.error;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'errorStatus')) {
            updatePayload.error_status = patch.errorStatus;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
            updatePayload.content = patch.content;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'metadata')) {
            updatePayload.metadata = patch.metadata;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'scheduledFor')) {
            updatePayload.scheduled_for = patch.scheduledFor;
        }

        await patchSupabaseRows('queue_items', { id: `eq.${queueItemId}` }, updatePayload);
        return queueItemId;
    }

    const state = await readLocalState();
    const queueItem = state.queue.find((item) => item.id === queueItemId);
    if (!queueItem) {
        return null;
    }

    Object.assign(queueItem, patch);
    await writeLocalState(state);
    return queueItem;
}

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
    readState,
    writeState,
    saveAccount,
    saveSchedule,
    saveQueueItems,
    saveQueueItem,
    updateQueueItemStatus,
    updateQueueItem,
    createId
};
