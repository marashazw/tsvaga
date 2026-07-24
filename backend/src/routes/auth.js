const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { toGeoPoint } = require('../utils/geo');

const router = express.Router();

// Geographic center of Zimbabwe - used as a placeholder location for new vendors
// until they set their real pin from the dashboard.
const ZW_CENTER = { lng: 29.1549, lat: -19.0154 };

// POST /api/auth/register
// For vendors, also pass business_name (defaults to name) and optionally lng/lat.
router.post('/register', async (req, res) => {
  const { name, phone, password, role, business_name, lng, lat, address_text } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'name, phone, and password are required' });
  }
  const allowedRoles = ['requester', 'vendor', 'both'];
  const safeRole = allowedRoles.includes(role) ? role : 'requester';
  // Admin accounts are never created through public self-registration - see
  // `npm run create:admin` for the only way to create/promote one.
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this phone number already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (name, phone, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, role, created_at`,
      [name, phone, safeRole, passwordHash]
    );
    const user = result.rows[0];

    if (user.role === 'vendor' || user.role === 'both') {
      const point = toGeoPoint(
        typeof lng === 'number' ? lng : ZW_CENTER.lng,
        typeof lat === 'number' ? lat : ZW_CENTER.lat
      );
      await client.query(
        `INSERT INTO vendors (id, business_name, location, address_text, is_online)
         VALUES ($1, $2, ${point}, $3, false)`,
        [user.id, business_name || name, address_text || null]
      );
      await client.query(
        `INSERT INTO subscriptions (vendor_id, status) VALUES ($1, 'inactive') ON CONFLICT (vendor_id) DO NOTHING`,
        [user.id]
      );
    }
    await client.query('COMMIT');

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    res.status(201).json({ user, token });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to register user' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'phone and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid phone number or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid phone number or password' });

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    delete user.password_hash;
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

module.exports = router;
