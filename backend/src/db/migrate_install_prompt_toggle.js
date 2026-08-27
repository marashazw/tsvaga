require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_install_prompt_toggle.sql'), 'utf8');
  console.log('Applying install_prompt_enabled migration...');
  await pool.query(sql);
  console.log('Done. Admins can now toggle the install banner from Platform Settings.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
