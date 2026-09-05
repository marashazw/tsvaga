require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('Checking for phone numbers that need whitespace normalization...');
  const { rows: needsFix } = await pool.query(`SELECT id, phone FROM users WHERE phone ~ '\\s'`);
  console.log(`Found ${needsFix.length} phone number(s) with whitespace.`);
  if (!needsFix.length) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  // phone has a UNIQUE constraint - check upfront whether normalizing would
  // collide two different accounts onto the same phone string (e.g. one
  // stored as "+263 771234567", another as "+263771234567"), so we can
  // report that clearly instead of the migration failing on a constraint
  // violation partway through with no context.
  const normalized = new Map(); // normalized phone -> [user ids]
  for (const { id, phone } of needsFix) {
    const clean = phone.replace(/\s+/g, '');
    if (!normalized.has(clean)) normalized.set(clean, []);
    normalized.get(clean).push(id);
  }
  // Also check against already-clean phones already in the table.
  const { rows: allPhones } = await pool.query('SELECT id, phone FROM users');
  const existingClean = new Map();
  for (const { id, phone } of allPhones) {
    if (!existingClean.has(phone)) existingClean.set(phone, []);
    existingClean.get(phone).push(id);
  }

  const conflicts = [];
  for (const [clean, ids] of normalized) {
    const existing = existingClean.get(clean) || [];
    const allIds = new Set([...ids, ...existing.filter((i) => !ids.includes(i))]);
    if (allIds.size > 1) conflicts.push({ clean, ids: [...allIds] });
  }

  if (conflicts.length) {
    console.error(`Found ${conflicts.length} collision(s) - these need manual resolution before normalizing:`);
    conflicts.forEach((c) => console.error(`  "${c.clean}" <- user ids: ${c.ids.join(', ')}`));
    console.error('Fix or merge these accounts first, then re-run this script.');
    await pool.end();
    process.exit(1);
  }

  console.log('No collisions found. Normalizing...');
  const result = await pool.query(`UPDATE users SET phone = REGEXP_REPLACE(phone, '\\s+', '', 'g') WHERE phone ~ '\\s'`);
  console.log(`Done. Normalized ${result.rowCount} phone number(s).`);
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
