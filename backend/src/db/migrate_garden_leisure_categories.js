require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_garden_leisure_categories.sql'), 'utf8');
  console.log('Adding Garden and Leisure categories...');
  const result = await pool.query(sql);
  console.log('Done. Existing "all categories" vendors now include Garden and Leisure too.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
