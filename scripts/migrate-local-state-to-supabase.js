const fs = require('fs/promises');
const path = require('path');
const { writeState } = require('../services/publishingStore');

async function main() {
    const statePath = path.join(__dirname, '..', 'data', 'publishing-state.json');
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);

    const state = {
        accounts: parsed.accounts || [],
        schedules: parsed.schedules || [],
        queue: parsed.queue || []
    };

    await writeState(state);
    console.log('Local publishing state migrated to Supabase successfully.');
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
