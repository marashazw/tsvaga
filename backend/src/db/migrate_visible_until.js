require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_visible_until.sql'), 'utf8');
  console.log('Applying visible_until migration...');
  await pool.query(sql);
  console.log('Done. Requests now auto-expire from "My requests" after 5 days unless renewed.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
