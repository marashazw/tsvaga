const express = require('express');
const pool = require('../config/db');

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

module.exports = router;
