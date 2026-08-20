const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { toGeoPoint, isWithinZimbabwe } = require('../utils/geo');
const { getSettings, isVendorPaidUp } = require('../utils/subscription');
const { CATEGORIES, sanitizeCategories } = require('../constants/categories');

const router = express.Router();

// GET /api/vendors/:vendorId/reviews - public, so requesters can see a vendor's track record
// before accepting their offer. No sensitive info here, so no auth required.
router.get('/:vendorId/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rv.id, rv.rating, rv.comment, rv.created_at
       FROM reviews rv
       JOIN orders o ON o.id = rv.order_id
       JOIN offers of ON of.id = o.offer_id
       WHERE of.vendor_id = $1
       ORDER BY rv.created_at DESC
       LIMIT 50`,
      [req.params.vendorId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/vendors/me/subscription - status + what it costs to (re)subscribe
router.get('/me/subscription', requireAuth, async (req, res) => {
  try {
    const sub = await pool.query('SELECT * FROM subscriptions WHERE vendor_id = $1', [req.user.id]);
    const settings = await getSettings();
    res.json({
      subscription: sub.rows[0] || { status: 'inactive', expires_at: null },
      price: settings.subscription_price,
      currency: settings.subscription_currency,
      ecocash_number: settings.ecocash_number,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// GET /api/vendors/me/priority - current boost status + available packages to buy
router.get('/me/priority', requireAuth, async (req, res) => {
  try {
    const vendor = await pool.query('SELECT priority_score, priority_expires_at FROM vendors WHERE id = $1', [
      req.user.id,
    ]);
    const packages = await pool.query('SELECT * FROM priority_packages WHERE active = true ORDER BY boost_score ASC');
    const settings = await getSettings();
    res.json({
      current: vendor.rows[0] || { priority_score: 0, priority_expires_at: null },
      packages: packages.rows,
      ecocash_number: settings.ecocash_number,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch priority status' });
  }
});

// POST /api/vendors/me/priority-submissions  { package_id, amount, ecocash_reference? }
// Same manual EcoCash-pay + admin-approve pattern as the base subscription.
router.post('/me/priority-submissions', requireAuth, async (req, res) => {
  const { package_id, amount, ecocash_reference } = req.body;
  if (!package_id || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'package_id and a valid amount are required' });
  }
  // A priority boost is an add-on ON TOP of an active base subscription - it
  // shouldn't be purchasable (or even submittable for approval) by a vendor
  // who isn't paid up yet, waived, or still pending approval.
  if (!(await isVendorPaidUp(req.user.id))) {
    return res.status(402).json({
      error: 'An active subscription is required before purchasing a priority boost. Subscribe first.',
      subscription_required: true,
    });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO priority_purchase_submissions (vendor_id, package_id, amount, ecocash_reference)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, package_id, amount, ecocash_reference || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit priority purchase' });
  }
});

// GET /api/vendors/me/priority-submissions - a vendor's own submission history
router.get('/me/priority-submissions', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ps.*, pp.name AS package_name FROM priority_purchase_submissions ps
     JOIN priority_packages pp ON pp.id = ps.package_id
     WHERE ps.vendor_id = $1 ORDER BY ps.created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/vendors/me/payment-submissions  { amount, ecocash_reference?, note? }
// Vendor self-reports an EcoCash payment; sits pending until an admin approves it.
router.post('/me/payment-submissions', requireAuth, async (req, res) => {
  const { amount, ecocash_reference, note } = req.body;
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'A valid amount is required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO payment_submissions (vendor_id, amount, ecocash_reference, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, amount, ecocash_reference || null, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit payment confirmation' });
  }
});

// GET /api/vendors/me/payment-submissions - a vendor's own submission history
router.get('/me/payment-submissions', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM payment_submissions WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/vendors/me/orders - active orders this vendor is fulfilling (for the dashboard)
router.get('/me/orders', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.created_at, o.delivered_at,
              r.product_text, r.quantity, r.address_text AS request_address,
              r.fulfillment_type, r.delivery_address_text, r.recipient_name, r.recipient_phone,
              u.phone AS requester_phone,
              of.id AS offer_id, of.price, of.delivery_fee, of.delivery_eta_minutes
       FROM orders o
       JOIN offers of ON of.id = o.offer_id
       JOIN requests r ON r.id = o.request_id
       JOIN users u ON u.id = r.requester_id
       WHERE of.vendor_id = $1 AND o.status != 'cancelled'
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vendor orders' });
  }
});

// GET /api/vendors/me - profile + current inventory, for the vendor dashboard
router.get('/me', requireAuth, async (req, res) => {
  try {
    const vendor = await pool.query(
      `SELECT v.id, v.business_name, v.address_text, v.is_online, v.rating_avg, v.notify_categories, u.role,
              ST_X(v.location::geometry) AS lng, ST_Y(v.location::geometry) AS lat
       FROM vendors v JOIN users u ON u.id = v.id WHERE v.id = $1`,
      [req.user.id]
    );
    if (!vendor.rows.length) return res.status(404).json({ error: 'No vendor profile for this account' });

    const inventory = await pool.query(
      `SELECT vi.id, vi.product_id, vi.in_stock, vi.typical_price, p.name, p.category
       FROM vendor_inventory vi JOIN products p ON p.id = vi.product_id
       WHERE vi.vendor_id = $1 ORDER BY p.name`,
      [req.user.id]
    );

    const subscription = await pool.query('SELECT status, expires_at FROM subscriptions WHERE vendor_id = $1', [
      req.user.id,
    ]);

    res.json({
      ...vendor.rows[0],
      inventory: inventory.rows,
      subscription: subscription.rows[0] || { status: 'inactive', expires_at: null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vendor profile' });
  }
});

// GET /api/vendors/me/notify-categories - the full category list plus this
// vendor's current selection, for rendering the preferences accordion.
router.get('/me/notify-categories', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT notify_categories, notify_mode FROM vendors WHERE id = $1', [
      req.user.id,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor profile not found' });
    res.json({
      all_categories: CATEGORIES,
      selected: result.rows[0].notify_categories,
      mode: result.rows[0].notify_mode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notification categories' });
  }
});

// PATCH /api/vendors/me/notify-categories  { categories: string[], mode?: 'categories'|'categories_and_inventory'|'inventory_only' }
router.patch('/me/notify-categories', requireAuth, async (req, res) => {
  const safeCategories = sanitizeCategories(req.body.categories);
  const allowedModes = ['categories', 'categories_and_inventory', 'inventory_only'];
  const mode = allowedModes.includes(req.body.mode) ? req.body.mode : 'categories';
  if (!safeCategories.length) {
    return res.status(400).json({ error: 'Select at least one category' });
  }
  try {
    const result = await pool.query(
      `UPDATE vendors SET notify_categories = $2, notify_mode = $3 WHERE id = $1
       RETURNING notify_categories, notify_mode`,
      [req.user.id, safeCategories, mode]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor profile not found' });
    res.json({ selected: result.rows[0].notify_categories, mode: result.rows[0].notify_mode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notification categories' });
  }
});

// POST /api/vendors/me/location  { lng, lat, address_text }
router.post('/me/location', requireAuth, async (req, res) => {
  const { lng, lat, address_text } = req.body;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return res.status(400).json({ error: 'lng and lat (numbers) are required' });
  }
  if (!isWithinZimbabwe(lng, lat)) {
    return res.status(422).json({ error: 'Coordinates fall outside the supported Zimbabwe service area' });
  }
  try {
    const result = await pool.query(
      `UPDATE vendors SET location = ${toGeoPoint(lng, lat)}, address_text = COALESCE($2, address_text)
       WHERE id = $1 RETURNING id, business_name, address_text`,
      [req.user.id, address_text || null]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// PATCH /api/vendors/me/profile  { business_name }
// Lets a vendor fix a typo in their shop name (or rename it later) without
// needing to contact support.
router.patch('/me/profile', requireAuth, async (req, res) => {
  const { business_name } = req.body;
  if (!business_name || !business_name.trim()) {
    return res.status(400).json({ error: 'business_name is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE vendors SET business_name = $2 WHERE id = $1 RETURNING id, business_name`,
      [req.user.id, business_name.trim()]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update shop name' });
  }
});

// PATCH /api/vendors/me/status  { is_online: true|false }
router.patch('/me/status', requireAuth, async (req, res) => {
  const { is_online } = req.body;
  try {
    const result = await pool.query(
      `UPDATE vendors SET is_online = $2 WHERE id = $1 RETURNING id, is_online`,
      [req.user.id, !!is_online]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /api/vendors/me/inventory  { product_id, in_stock, typical_price }
router.post('/me/inventory', requireAuth, async (req, res) => {
  const { product_id, in_stock, typical_price } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });
  try {
    const result = await pool.query(
      `INSERT INTO vendor_inventory (vendor_id, product_id, in_stock, typical_price)
       VALUES ($1, $2, COALESCE($3, true), $4)
       ON CONFLICT (vendor_id, product_id)
       DO UPDATE SET in_stock = EXCLUDED.in_stock, typical_price = EXCLUDED.typical_price, updated_at = now()
       RETURNING *`,
      [req.user.id, product_id, in_stock, typical_price || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

module.exports = router;
