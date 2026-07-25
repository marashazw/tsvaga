const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { isConfigured } = require('../config/push');

const router = express.Router();

// GET /api/push/public-key - frontend fetches this instead of hardcoding it
router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, enabled: isConfigured });
});

// POST /api/vendors/me/push-subscription  { endpoint, keys: { p256dh, auth } }
router.post('/me/push-subscription', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'A valid PushSubscription (endpoint + keys) is required' });
  }
  try {
    await pool.query(
      `INSERT INTO vendor_push_subscriptions (vendor_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ subscribed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// DELETE /api/vendors/me/push-subscription  { endpoint }
router.delete('/me/push-subscription', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await pool.query('DELETE FROM vendor_push_subscriptions WHERE vendor_id = $1 AND endpoint = $2', [
      req.user.id,
      endpoint,
    ]);
    res.json({ subscribed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

module.exports = router;
