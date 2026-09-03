require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_service_requests.sql'), 'utf8');
  console.log('Adding service request support (request_type, is_remote, dropoff_address_text)...');
  await pool.query(sql);
  console.log('Done. Existing "all categories" vendors now include service categories too.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
