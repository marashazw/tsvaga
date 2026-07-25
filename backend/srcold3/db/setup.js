require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  console.log('Applying schema...');
  await pool.query(schema);

  console.log('Applying seed data...');
  await pool.query(seed);

  console.log('Done. Database ready with sample Zimbabwe vendors.');
  await pool.end();
}

run().catch((err) => {
  console.error('DB setup failed:', err);
  process.exit(1);
});
