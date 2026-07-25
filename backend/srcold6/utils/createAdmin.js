require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Usage: node src/utils/createAdmin.js "Full Name" "+263771234567" "a-strong-password"
// If the phone number already exists, it promotes that account to 'admin'
// and resets its password; otherwise it creates a new admin account.
async function run() {
  const [, , name, phone, password] = process.argv;
  if (!name || !phone || !password) {
    console.error('Usage: node src/utils/createAdmin.js "Full Name" "+263771234567" "a-strong-password"');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length) {
    await pool.query(`UPDATE users SET role = 'admin', password_hash = $2, name = $1 WHERE phone = $3`, [
      name,
      passwordHash,
      phone,
    ]);
    console.log(`Promoted existing account (${phone}) to admin and reset its password.`);
  } else {
    await pool.query(
      `INSERT INTO users (name, phone, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
      [name, phone, passwordHash]
    );
    console.log(`Created new admin account for ${phone}.`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
