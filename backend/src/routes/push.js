const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { isConfigured } = require('../config/push');

const router = express.Router();

// GET /api/push/public-key - frontend fetches this instead of hardcoding it
router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, enabled: isConfigured });
});

// POST /me/push-subscription  { endpoint, keys: { p256dh, auth } }
// Works for ANY signed-in user (requester or vendor) - mounted under both
// /api/vendors and /api/users so either frontend can call the same shape.
router.post('/me/push-subscription', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'A valid PushSubscription (endpoint + keys) is required' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
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

// DELETE /me/push-subscription  { endpoint }
router.delete('/me/push-subscription', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [
      req.user.id,
      endpoint,
    ]);
    res.json({ subscribed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// POST /me/fcm-token  { token }
// Same pattern as push-subscription above, but for the native Capacitor
// app's FCM token instead of a browser's Web Push subscription. Mounted
// under the same routers, works for any signed-in user.
router.post('/me/fcm-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'An FCM token is required' });
  }
  try {
    await pool.query(
      `INSERT INTO fcm_tokens (user_id, token) VALUES ($1, $2)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [req.user.id, token]
    );
    res.status(201).json({ subscribed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save FCM token' });
  }
});

// DELETE /me/fcm-token  { token }
router.delete('/me/fcm-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  try {
    await pool.query('DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2', [req.user.id, token]);
    res.json({ subscribed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove FCM token' });
  }
});

module.exports = router;
