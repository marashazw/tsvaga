const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { notifyUsersByPush } = require('../utils/pushSender');

const NEXT_STATUS = {
  confirmed: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

// Recomputes a vendor's rating_avg from all their reviews (across all orders).
// Simple and correct at any review volume; if this ever needs to scale to a
// very high review count, it could become an incremental running average instead.
async function recomputeVendorRating(client, vendorId) {
  const { rows } = await client.query(
    `SELECT AVG(rv.rating)::numeric(2,1) AS avg_rating
     FROM reviews rv
     JOIN orders o ON o.id = rv.order_id
     JOIN offers of ON of.id = o.offer_id
     WHERE of.vendor_id = $1`,
    [vendorId]
  );
  const avg = rows[0].avg_rating;
  if (avg !== null) {
    await client.query('UPDATE vendors SET rating_avg = $2 WHERE id = $1', [vendorId, avg]);
  }
}

module.exports = function buildOrdersRouter(io) {
  const router = express.Router();

  // GET /api/orders/:id - full order + request + offer + vendor detail, for the tracking screen
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT o.id, o.status, o.created_at, o.delivered_at,
                r.id AS request_id, r.product_text, r.quantity, r.address_text AS request_address, r.requester_id,
                r.fulfillment_type, r.delivery_address_text, r.recipient_name, r.recipient_phone, r.request_type,
                u.phone AS requester_phone,
                of.id AS offer_id, of.price, of.delivery_fee, of.delivery_eta_minutes, of.message, of.cart_prices,
                v.id AS vendor_id, v.business_name, v.address_text AS vendor_address, v.rating_avg,
                rv.id AS review_id, rv.rating AS review_rating, rv.comment AS review_comment
         FROM orders o
         JOIN requests r ON r.id = o.request_id
         JOIN offers of ON of.id = o.offer_id
         JOIN vendors v ON v.id = of.vendor_id
         JOIN users u ON u.id = r.requester_id
         LEFT JOIN reviews rv ON rv.order_id = o.id
         WHERE o.id = $1`,
        [req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

      const order = result.rows[0];
      // Only the requester who placed it or the vendor fulfilling it can view it.
      if (req.user.id !== order.requester_id && req.user.id !== order.vendor_id) {
        return res.status(403).json({ error: 'Not authorized to view this order' });
      }
      res.json(order);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // PATCH /api/orders/:id/status  { status: 'out_for_delivery' | 'delivered' | 'cancelled' }
  // Only the fulfilling vendor can advance status.
  router.patch('/:id/status', requireAuth, async (req, res) => {
    const { status } = req.body;
    const allowed = ['out_for_delivery', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }
    try {
      const orderRow = await pool.query(
        `SELECT o.*, of.vendor_id, r.requester_id, r.product_text, r.fulfillment_type
         FROM orders o JOIN offers of ON of.id = o.offer_id JOIN requests r ON r.id = o.request_id
         WHERE o.id = $1`,
        [req.params.id]
      );
      if (!orderRow.rows.length) return res.status(404).json({ error: 'Order not found' });
      const order = orderRow.rows[0];

      if (req.user.id !== order.vendor_id) {
        return res.status(403).json({ error: 'Only the fulfilling vendor can update order status' });
      }
      if (status !== 'cancelled' && NEXT_STATUS[order.status] !== status) {
        return res.status(409).json({ error: `Order is currently '${order.status}' and cannot jump to '${status}'` });
      }

      const delivered_at = status === 'delivered' ? new Date() : null;
      const updated = await pool.query(
        `UPDATE orders SET status = $2, delivered_at = COALESCE($3, delivered_at) WHERE id = $1 RETURNING *`,
        [order.id, status, delivered_at]
      );

      // Once delivered, the request stays in the requester's history log
      // indefinitely (until they explicitly delete it) rather than expiring
      // after the usual 5 days - 'infinity' is a real, valid Postgres
      // timestamptz value, so the existing `visible_until > now()` check
      // elsewhere needs no changes at all to respect this.
      if (status === 'delivered') {
        await pool.query(`UPDATE requests SET visible_until = 'infinity' WHERE id = $1`, [order.request_id]);
      }

      const payload = { order_id: order.id, request_id: order.request_id, status };
      io.to(`request:${order.request_id}`).emit('order:status', payload);
      io.to(`vendor:${order.vendor_id}`).emit('order:status', payload);
      io.to(`user:${order.requester_id}`).emit('myrequests:updated');

      // Let the requester know even if their tab isn't open right now.
      const isPickup = order.fulfillment_type === 'pickup';
      const STATUS_MESSAGES = {
        out_for_delivery: {
          title: isPickup ? 'Your order is ready for pickup!' : 'Your order is out for delivery!',
          body: order.product_text,
        },
        delivered: {
          title: isPickup ? 'Order picked up' : 'Order delivered!',
          body: `${order.product_text} - enjoy! Don't forget to leave a rating.`,
        },
        cancelled: {
          title: 'Order cancelled',
          body: order.product_text,
        },
      };
      const notice = STATUS_MESSAGES[status];
      if (notice) {
        notifyUsersByPush([order.requester_id], { ...notice, order_id: order.id, url: '/' }).catch((err) =>
          console.error('Push notification failed:', err)
        );
      }

      res.json(updated.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  // POST /api/orders/:id/reviews  { rating: 1-5, comment? }
  // Only the requester can review, and only once the order is delivered.
  router.post('/:id/reviews', requireAuth, async (req, res) => {
    const { rating, comment } = req.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const orderRow = await client.query(
        `SELECT o.*, of.vendor_id, r.requester_id
         FROM orders o JOIN offers of ON of.id = o.offer_id JOIN requests r ON r.id = o.request_id
         WHERE o.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!orderRow.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orderRow.rows[0];

      if (req.user.id !== order.requester_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the requester who placed this order can review it' });
      }
      if (order.status !== 'delivered') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You can only review an order once it has been delivered' });
      }

      const existing = await client.query('SELECT id FROM reviews WHERE order_id = $1', [order.id]);
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This order has already been reviewed' });
      }

      const review = await client.query(
        `INSERT INTO reviews (order_id, rating, comment) VALUES ($1, $2, $3) RETURNING *`,
        [order.id, rating, comment || null]
      );

      await recomputeVendorRating(client, order.vendor_id);

      await client.query('COMMIT');

      io.to(`vendor:${order.vendor_id}`).emit('review:new', { order_id: order.id, rating, comment: comment || null });
      io.to(`user:${order.requester_id}`).emit('myrequests:updated');

      res.status(201).json(review.rows[0]);
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Failed to submit review' });
    } finally {
      if (client) client.release();
    }
  });

  return router;
};
