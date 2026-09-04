require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'backfill_delivered_visible_until.sql'), 'utf8');
  console.log('Extending visible_until for already-delivered orders...');
  const result = await pool.query(sql);
  console.log(`Done. Updated ${result.rowCount} request(s) to be kept permanently.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
