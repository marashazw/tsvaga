require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_priority_ranking.sql'), 'utf8');
  console.log('Applying priority ranking migration...');
  await pool.query(sql);
  console.log('Done. Vendor priority ranking packages are ready (2 starter packages seeded).');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
