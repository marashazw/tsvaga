require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_admin_moderation.sql'), 'utf8');
  console.log('Adding user blocking columns...');
  await pool.query(sql);

  // ALTER TYPE ... ADD VALUE cannot run inside a transaction block - and
  // sending multiple ;-separated statements in one query() call implicitly
  // wraps them in one, even without an explicit BEGIN/COMMIT. Running this
  // as its own separate query() call keeps it outside any transaction.
  console.log("Adding 'blocked' request status...");
  await pool.query(`ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'blocked'`);

  console.log('Done.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
