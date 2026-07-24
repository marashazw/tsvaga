const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM platform_settings WHERE id = 1');
  res.json(rows[0]);
});

// PATCH /api/admin/settings  { subscription_price?, subscription_currency?, ecocash_number? }
router.patch('/settings', async (req, res) => {
  const { subscription_price, subscription_currency, ecocash_number } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE platform_settings SET
         subscription_price = COALESCE($1, subscription_price),
         subscription_currency = COALESCE($2, subscription_currency),
         ecocash_number = COALESCE($3, ecocash_number),
         updated_at = now()
       WHERE id = 1
       RETURNING *`,
      [subscription_price ?? null, subscription_currency ?? null, ecocash_number ?? null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/admin/vendors - every vendor with their current subscription status
router.get('/vendors', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT v.id, v.business_name, v.address_text, v.is_online, u.phone,
            s.status AS subscription_status, s.expires_at, s.note
     FROM vendors v
     JOIN users u ON u.id = v.id
     LEFT JOIN subscriptions s ON s.vendor_id = v.id
     ORDER BY v.business_name`
  );
  res.json(rows);
});

// POST /api/admin/vendors/:vendorId/activate
// { months?: number (default 1), waive?: boolean, note?: string }
// - waive: true grants indefinite free access (status='waived', no expiry)
// - otherwise activates/extends a paid subscription by `months` from now
//   (or from the current expiry if it's still in the future)
router.post('/vendors/:vendorId/activate', async (req, res) => {
  const { vendorId } = req.params;
  const { months, waive, note } = req.body;

  try {
    if (waive) {
      const { rows } = await pool.query(
        `INSERT INTO subscriptions (vendor_id, status, expires_at, updated_by, note)
         VALUES ($1, 'waived', NULL, $2, $3)
         ON CONFLICT (vendor_id) DO UPDATE SET status = 'waived', expires_at = NULL, updated_by = $2, note = $3, updated_at = now()
         RETURNING *`,
        [vendorId, req.user.id, note || 'Waived by admin']
      );
      return res.json(rows[0]);
    }

    const monthsToAdd = Number(months) > 0 ? Number(months) : 1;
    const { rows } = await pool.query(
      `INSERT INTO subscriptions (vendor_id, status, expires_at, updated_by, note)
       VALUES ($1, 'active', now() + ($2 || ' months')::interval, $3, $4)
       ON CONFLICT (vendor_id) DO UPDATE SET
         status = 'active',
         expires_at = GREATEST(COALESCE(subscriptions.expires_at, now()), now()) + ($2 || ' months')::interval,
         updated_by = $3,
         note = COALESCE($4, subscriptions.note),
         updated_at = now()
       RETURNING *`,
      [vendorId, monthsToAdd, req.user.id, note || null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update vendor subscription' });
  }
});

// POST /api/admin/vendors/:vendorId/deactivate - manually revoke (e.g. chargeback, abuse)
router.post('/vendors/:vendorId/deactivate', async (req, res) => {
  const { note } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE subscriptions SET status = 'inactive', updated_by = $2, note = $3, updated_at = now()
       WHERE vendor_id = $1 RETURNING *`,
      [req.params.vendorId, req.user.id, note || 'Deactivated by admin']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate vendor subscription' });
  }
});

// GET /api/admin/payment-submissions?status=pending
router.get('/payment-submissions', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT ps.*, v.business_name, u.phone
     FROM payment_submissions ps
     JOIN vendors v ON v.id = ps.vendor_id
     JOIN users u ON u.id = v.id
     WHERE ps.status = $1
     ORDER BY ps.created_at ASC`,
    [status]
  );
  res.json(rows);
});

// PATCH /api/admin/payment-submissions/:id/approve  { months? }
router.patch('/payment-submissions/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sub = await client.query('SELECT * FROM payment_submissions WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!sub.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment submission not found' });
    }
    const submission = sub.rows[0];
    const monthsToAdd = Number(req.body.months) > 0 ? Number(req.body.months) : 1;

    await client.query(
      `UPDATE payment_submissions SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [submission.id, req.user.id]
    );

    const result = await client.query(
      `INSERT INTO subscriptions (vendor_id, status, expires_at, updated_by, note)
       VALUES ($1, 'active', now() + ($2 || ' months')::interval, $3, $4)
       ON CONFLICT (vendor_id) DO UPDATE SET
         status = 'active',
         expires_at = GREATEST(COALESCE(subscriptions.expires_at, now()), now()) + ($2 || ' months')::interval,
         updated_by = $3,
         note = $4,
         updated_at = now()
       RETURNING *`,
      [submission.vendor_id, monthsToAdd, req.user.id, `Approved payment submission ${submission.id}`]
    );

    await client.query('COMMIT');
    res.json({ payment_submission: { ...submission, status: 'approved' }, subscription: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to approve payment submission' });
  } finally {
    client.release();
  }
});

// PATCH /api/admin/payment-submissions/:id/reject  { note? }
router.patch('/payment-submissions/:id/reject', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE payment_submissions SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payment submission not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject payment submission' });
  }
});

module.exports = router;
