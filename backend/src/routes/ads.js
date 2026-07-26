const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Character caps so a submission can't turn into a wall of text (or a
// literal book) - enforced here server-side, not just as a UI suggestion.
const LIMITS = {
  title: 100,
  body: 300,
  url: 500,
  whatsapp_number: 20,
};

function checkLength(value, field, max) {
  if (value && value.length > max) {
    return `${field} must be ${max} characters or fewer (got ${value.length})`;
  }
  return null;
}

// GET /api/ads/active - public, no auth. Returns only what's needed to render
// an ad slot; never the payment/review fields.
router.get('/active', async (req, res) => {
  try {
    const settings = await pool.query('SELECT max_active_ads FROM platform_settings WHERE id = 1');
    const limit = settings.rows[0]?.max_active_ads || 5;
    const { rows } = await pool.query(
      `SELECT id, ad_type, title, body, video_url, image_url, link_url, whatsapp_number
       FROM ads
       WHERE status = 'active' AND starts_at <= now() AND ends_at > now()
       ORDER BY random()
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ads' });
  }
});

// GET /api/ads/me - the signed-in user's own ad submissions/history
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ads WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch your ads' });
  }
});

// GET /api/ads/pricing - the reference per-day price and EcoCash number, same
// pattern as vendor subscriptions, so the submission form can show it.
router.get('/pricing', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ad_price_per_day, subscription_currency, ecocash_number FROM platform_settings WHERE id = 1'
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// POST /api/ads  { ad_type, title, body?, video_url?, image_url?, link_url?, whatsapp_number?, duration_days, amount, ecocash_reference? }
// Open to ANY signed-in user - vendor or requester - not vendor-only. Sits as
// 'pending' until an admin reviews the (self-reported, EcoCash) payment.
router.post('/', requireAuth, async (req, res) => {
  const { ad_type, title, body, video_url, image_url, link_url, whatsapp_number, duration_days, amount, ecocash_reference } =
    req.body;

  if (!['text', 'video'].includes(ad_type)) {
    return res.status(400).json({ error: "ad_type must be 'text' or 'video'" });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (ad_type === 'video' && !video_url) {
    return res.status(400).json({ error: 'video_url is required for a video ad' });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'A valid amount is required' });
  }

  const lengthError =
    checkLength(title, 'title', LIMITS.title) ||
    checkLength(body, 'body', LIMITS.body) ||
    checkLength(video_url, 'video_url', LIMITS.url) ||
    checkLength(image_url, 'image_url', LIMITS.url) ||
    checkLength(link_url, 'link_url', LIMITS.url) ||
    checkLength(whatsapp_number, 'whatsapp_number', LIMITS.whatsapp_number);
  if (lengthError) {
    return res.status(400).json({ error: lengthError });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO ads (owner_id, ad_type, title, body, video_url, image_url, link_url, whatsapp_number, duration_days, amount, ecocash_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 7), $10, $11)
       RETURNING *`,
      [
        req.user.id,
        ad_type,
        title.trim(),
        body || null,
        video_url || null,
        image_url || null,
        link_url || null,
        whatsapp_number || null,
        duration_days || null,
        amount,
        ecocash_reference || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit ad' });
  }
});

module.exports = router;
