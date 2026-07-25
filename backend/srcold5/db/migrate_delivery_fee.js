require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_delivery_fee.sql'), 'utf8');
  console.log('Applying delivery_fee migration...');
  await pool.query(sql);
  console.log('Done. offers now has a separate delivery_fee.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
