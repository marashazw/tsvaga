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
  let client;
  try {
    client = await pool.connect();
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
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to approve payment submission' });
  } finally {
    if (client) client.release();
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

// ── Priority ranking packages ──────────────────────────────────────────

// GET /api/admin/priority-packages - all packages (active and inactive)
router.get('/priority-packages', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM priority_packages ORDER BY boost_score DESC');
  res.json(rows);
});

// POST /api/admin/priority-packages  { name, price, duration_days, boost_score }
router.post('/priority-packages', async (req, res) => {
  const { name, price, duration_days, boost_score } = req.body;
  if (!name || typeof price !== 'number') {
    return res.status(400).json({ error: 'name and price are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO priority_packages (name, price, duration_days, boost_score)
       VALUES ($1, $2, COALESCE($3, 30), COALESCE($4, 10)) RETURNING *`,
      [name, price, duration_days || null, boost_score || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create priority package' });
  }
});

// PATCH /api/admin/priority-packages/:id  { name?, price?, duration_days?, boost_score?, active? }
router.patch('/priority-packages/:id', async (req, res) => {
  const { name, price, duration_days, boost_score, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE priority_packages SET
         name = COALESCE($2, name), price = COALESCE($3, price),
         duration_days = COALESCE($4, duration_days), boost_score = COALESCE($5, boost_score),
         active = COALESCE($6, active)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name ?? null, price ?? null, duration_days ?? null, boost_score ?? null, active ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Package not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update priority package' });
  }
});

// GET /api/admin/priority-submissions?status=pending
router.get('/priority-submissions', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT ps.*, v.business_name, u.phone, pp.name AS package_name, pp.duration_days, pp.boost_score
     FROM priority_purchase_submissions ps
     JOIN vendors v ON v.id = ps.vendor_id
     JOIN users u ON u.id = v.id
     JOIN priority_packages pp ON pp.id = ps.package_id
     WHERE ps.status = $1
     ORDER BY ps.created_at ASC`,
    [status]
  );
  res.json(rows);
});

// PATCH /api/admin/priority-submissions/:id/approve
router.patch('/priority-submissions/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sub = await client.query(
      `SELECT ps.*, pp.duration_days, pp.boost_score
       FROM priority_purchase_submissions ps JOIN priority_packages pp ON pp.id = ps.package_id
       WHERE ps.id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!sub.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Priority submission not found' });
    }
    const submission = sub.rows[0];

    await client.query(
      `UPDATE priority_purchase_submissions SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [submission.id, req.user.id]
    );

    // Extend from the current expiry if it's still in the future, otherwise from now.
    const vendorResult = await client.query(
      `UPDATE vendors SET
         priority_score = $2,
         priority_expires_at = GREATEST(COALESCE(priority_expires_at, now()), now()) + ($3 || ' days')::interval
       WHERE id = $1 RETURNING id, priority_score, priority_expires_at`,
      [submission.vendor_id, submission.boost_score, submission.duration_days]
    );

    await client.query('COMMIT');
    res.json({ submission: { ...submission, status: 'approved' }, vendor: vendorResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to approve priority submission' });
  } finally {
    client.release();
  }
});

// PATCH /api/admin/priority-submissions/:id/reject
router.patch('/priority-submissions/:id/reject', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE priority_purchase_submissions SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Priority submission not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject priority submission' });
  }
});

// ── Ads ─────────────────────────────────────────────────────────────────

// GET /api/admin/ads?status=pending
router.get('/ads', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS owner_name, u.phone AS owner_phone
     FROM ads a JOIN users u ON u.id = a.owner_id
     WHERE a.status = $1 ORDER BY a.created_at ASC`,
    [status]
  );
  res.json(rows);
});

// PATCH /api/admin/ads/:id/approve  { duration_days? }
router.patch('/ads/:id/approve', async (req, res) => {
  try {
    const adRow = await pool.query('SELECT * FROM ads WHERE id = $1', [req.params.id]);
    if (!adRow.rows.length) return res.status(404).json({ error: 'Ad not found' });
    const ad = adRow.rows[0];
    const days = Number(req.body.duration_days) > 0 ? Number(req.body.duration_days) : ad.duration_days;

    const { rows } = await pool.query(
      `UPDATE ads SET status = 'active', starts_at = now(), ends_at = now() + ($2 || ' days')::interval,
              reviewed_by = $3, reviewed_at = now()
       WHERE id = $1 RETURNING *`,
      [ad.id, days, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve ad' });
  }
});

// PATCH /api/admin/ads/:id/reject
router.patch('/ads/:id/reject', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ads SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ad not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject ad' });
  }
});

// ── Usage statistics ───────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      users,
      vendors,
      requestsToday,
      requests7d,
      requests30d,
      ordersCompleted,
      ordersCompleted30d,
      activeSubs,
      activeAds,
    ] = await Promise.all([
      pool.query(`SELECT role, COUNT(*) FROM users GROUP BY role`),
      pool.query(`SELECT COUNT(*) FROM vendors`),
      pool.query(`SELECT COUNT(*) FROM requests WHERE created_at > now() - interval '1 day'`),
      pool.query(`SELECT COUNT(*) FROM requests WHERE created_at > now() - interval '7 days'`),
      pool.query(`SELECT COUNT(*) FROM requests WHERE created_at > now() - interval '30 days'`),
      pool.query(`SELECT COUNT(*) FROM orders WHERE status = 'delivered'`),
      pool.query(`SELECT COUNT(*) FROM orders WHERE status = 'delivered' AND delivered_at > now() - interval '30 days'`),
      pool.query(`SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expires_at > now()`),
      pool.query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND ends_at > now()`),
    ]);

    const usersByRole = {};
    users.rows.forEach((r) => (usersByRole[r.role] = Number(r.count)));

    res.json({
      users_by_role: usersByRole,
      total_vendors: Number(vendors.rows[0].count),
      requests_last_24h: Number(requestsToday.rows[0].count),
      requests_last_7d: Number(requests7d.rows[0].count),
      requests_last_30d: Number(requests30d.rows[0].count),
      orders_completed_total: Number(ordersCompleted.rows[0].count),
      orders_completed_last_30d: Number(ordersCompleted30d.rows[0].count),
      active_subscriptions: Number(activeSubs.rows[0].count),
      active_ads: Number(activeAds.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
