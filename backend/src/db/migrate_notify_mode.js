require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_notify_mode.sql'), 'utf8');
  console.log('Applying notify_mode migration...');
  await pool.query(sql);
  console.log('Done. Vendors can now choose categories, categories + inventory, or inventory only.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
