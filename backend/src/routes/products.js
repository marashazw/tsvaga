const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { containsProhibitedContent, flagAndReject } = require('../constants/prohibitedContent');

const router = express.Router();

// GET /api/products?search=
router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    const result = search
      ? await pool.query(
          `SELECT * FROM products WHERE name ILIKE $1 OR $2 = ANY(synonyms) ORDER BY name LIMIT 20`,
          [`%${search}%`, search]
        )
      : await pool.query('SELECT * FROM products ORDER BY name LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// POST /api/products  { name, category?, type? }
// Lets a vendor add a product that isn't already in the shared catalog -
// the seeded list is a starting point, not the only thing vendors can sell.
// If a product with the same name AND type already exists (case-insensitive),
// that existing one is returned instead of creating a duplicate - checking
// type too means "Cleaning" the product and "Cleaning" the service can
// coexist as distinct catalog entries without colliding.
router.post('/', requireAuth, async (req, res) => {
  const { name, category, type } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (containsProhibitedContent(name)) {
    return flagAndReject(pool, req, res, 'product', name);
  }
  const safeType = type === 'service' ? 'service' : 'product';
  try {
    const existing = await pool.query('SELECT * FROM products WHERE LOWER(name) = LOWER($1) AND type = $2', [
      name.trim(),
      safeType,
    ]);
    if (existing.rows.length) {
      return res.json(existing.rows[0]);
    }
    const result = await pool.query(
      `INSERT INTO products (name, category, type) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), category || null, safeType]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

module.exports = router;
