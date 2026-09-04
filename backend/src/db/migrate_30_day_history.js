require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_30_day_history.sql'), 'utf8');
  console.log('Extending history log period from 5 to 30 days...');
  await pool.query(sql);
  console.log('Done. New requests default to 30 days, and existing active ones have been extended too.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
