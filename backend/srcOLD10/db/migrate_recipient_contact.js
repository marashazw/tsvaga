require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_recipient_contact.sql'), 'utf8');
  console.log('Applying recipient contact migration...');
  await pool.query(sql);
  console.log('Done. requests now supports a recipient name/phone.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
