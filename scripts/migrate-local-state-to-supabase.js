const fs = require('fs/promises');
const path = require('path');
const { writeState } = require('../services/publishingStore');

async function main() {
    const statePath = path.join(__dirname, '..', 'data', 'publishing-state.json');
    const migrationUserId = String(process.env.MIGRATION_USER_ID || '').trim();
    if (!migrationUserId) {
        throw new Error('MIGRATION_USER_ID is required so legacy records can be attached to one authenticated user.');
    }

    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);

    const state = {
        accounts: parsed.accounts || [],
        schedules: parsed.schedules || [],
        queue: parsed.queue || []
    };

    await writeState(state, { userId: migrationUserId });
    console.log(`Local publishing state migrated to Supabase successfully for user ${migrationUserId}.`);
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
