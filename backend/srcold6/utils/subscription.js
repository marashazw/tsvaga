const pool = require('../config/db');

// A vendor is "paid up" if they've been waived by an admin, or their paid
// subscription is active and hasn't expired yet.
async function isVendorPaidUp(vendorId) {
  const { rows } = await pool.query('SELECT status, expires_at FROM subscriptions WHERE vendor_id = $1', [
    vendorId,
  ]);
  if (!rows.length) return false;
  const sub = rows[0];
  if (sub.status === 'waived') return true;
  if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) return true;
  return false;
}

async function getSettings() {
  const { rows } = await pool.query('SELECT * FROM platform_settings WHERE id = 1');
  return rows[0];
}

// Batch version of isVendorPaidUp, for when we need to check many vendors at
// once (e.g. fanning out alerts to a page of matched vendors).
async function getPaidVendorIdSet(vendorIds) {
  if (!vendorIds.length) return new Set();
  const { rows } = await pool.query(
    `SELECT vendor_id FROM subscriptions
     WHERE vendor_id = ANY($1)
       AND (status = 'waived' OR (status = 'active' AND expires_at > now()))`,
    [vendorIds]
  );
  return new Set(rows.map((r) => r.vendor_id));
}

module.exports = { isVendorPaidUp, getSettings, getPaidVendorIdSet };
