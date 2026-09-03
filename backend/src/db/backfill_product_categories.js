require('dotenv').config();
const { Pool } = require('pg');
const { detectCategory } = require('../constants/categoryKeywords');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows } = await pool.query('SELECT id, name, type FROM products WHERE category IS NULL');
  console.log(`Found ${rows.length} uncategorized product(s). Detecting categories...`);

  let updated = 0;
  for (const p of rows) {
    const category = detectCategory(p.name, p.type);
    if (category) {
      await pool.query('UPDATE products SET category = $1 WHERE id = $2', [category, p.id]);
      updated++;
      console.log(`  "${p.name}" (${p.type}) -> ${category}`);
    }
  }

  console.log(`Done. Categorized ${updated} of ${rows.length} product(s). The rest had no keyword match - left as-is.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
