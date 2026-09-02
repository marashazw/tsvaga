require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_optional_eta.sql'), 'utf8');
  console.log('Making delivery_eta_minutes nullable...');
  await pool.query(sql);
  console.log('Done.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
