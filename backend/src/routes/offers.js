const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { isVendorPaidUp, getSettings } = require('../utils/subscription');
const { notifyUsersByPush } = require('../utils/pushSender');
const { containsProhibitedContent, flagAndReject } = require('../constants/prohibitedContent');

module.exports = function buildOffersRouter(io) {
  const router = express.Router();

  // POST /api/requests/:requestId/offers  { price, delivery_fee?, delivery_eta_minutes, message }
  router.post('/:requestId/offers', requireAuth, async (req, res) => {
    const { requestId } = req.params;
    const { price, delivery_fee, delivery_eta_minutes, message } = req.body;
    if (typeof price !== 'number') {
      return res.status(400).json({ error: 'price (a number) is required' });
    }
    if (delivery_eta_minutes !== undefined && typeof delivery_eta_minutes !== 'number') {
      return res.status(400).json({ error: 'delivery_eta_minutes must be a number if provided' });
    }
    if (delivery_fee !== undefined && (typeof delivery_fee !== 'number' || delivery_fee < 0)) {
      return res.status(400).json({ error: 'delivery_fee must be a non-negative number if provided' });
    }
    if (containsProhibitedContent(message)) {
      return flagAndReject(pool, req, res, 'offer', message);
    }
    try {
      const paidUp = await isVendorPaidUp(req.user.id);
      if (!paidUp) {
        const settings = await getSettings();
        return res.status(402).json({
          error: 'An active subscription is required to respond to requests',
          subscription_required: true,
          price: settings.subscription_price,
          currency: settings.subscription_currency,
          ecocash_number: settings.ecocash_number,
        });
      }

      const requestRow = await pool.query('SELECT * FROM requests WHERE id = $1', [requestId]);
      if (!requestRow.rows.length) return res.status(404).json({ error: 'Request not found' });
      if (requestRow.rows[0].status !== 'open') {
        return res.status(409).json({ error: 'This request is no longer accepting offers' });
      }

      const result = await pool.query(
        `INSERT INTO offers (request_id, vendor_id, price, delivery_fee, delivery_eta_minutes, message)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (request_id, vendor_id)
         DO UPDATE SET price = EXCLUDED.price, delivery_fee = EXCLUDED.delivery_fee,
                        delivery_eta_minutes = EXCLUDED.delivery_eta_minutes,
                        message = EXCLUDED.message, status = 'pending'
         RETURNING *`,
        [requestId, req.user.id, price, delivery_fee || 0, delivery_eta_minutes ?? null, message || null]
      );
      const offer = result.rows[0];

      const vendorInfo = await pool.query(
        `SELECT business_name, rating_avg,
                CASE WHEN priority_expires_at > now() THEN priority_score ELSE 0 END AS vendor_priority
         FROM vendors WHERE id = $1`,
        [req.user.id]
      );

      // Push the new offer live to whoever is watching this request.
      io.to(`request:${requestId}`).emit('offer:new', {
        ...offer,
        business_name: vendorInfo.rows[0]?.business_name,
        rating_avg: vendorInfo.rows[0]?.rating_avg,
        vendor_priority: vendorInfo.rows[0]?.vendor_priority || 0,
      });
      // Also nudge My Requests, regardless of whether this happens to be
      // the requester's currently "active" request.
      io.to(`user:${requestRow.rows[0].requester_id}`).emit('myrequests:updated');

      res.status(201).json(offer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to submit offer' });
    }
  });

  // PATCH /api/offers/:id/accept
  router.patch('/:id/accept', requireAuth, async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const offerRow = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!offerRow.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offer not found' });
      }
      const offer = offerRow.rows[0];

      await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offer.id]);
      await client.query(
        `UPDATE offers SET status = 'declined' WHERE request_id = $1 AND id != $2 AND status = 'pending'`,
        [offer.request_id, offer.id]
      );
      await client.query(`UPDATE requests SET status = 'matched' WHERE id = $1`, [offer.request_id]);

      const orderResult = await client.query(
        `INSERT INTO orders (request_id, offer_id) VALUES ($1, $2) RETURNING *`,
        [offer.request_id, offer.id]
      );

      await client.query('COMMIT');

      io.to(`request:${offer.request_id}`).emit('request:matched', { request_id: offer.request_id, offer_id: offer.id });
      // req.user.id is the requester here - they're the one accepting.
      io.to(`user:${req.user.id}`).emit('myrequests:updated');

      // Fetch the fully-joined order detail (same shape as GET /vendors/me/orders)
      // so the vendor dashboard can add this straight into its list without a
      // page reload - a bare order:status ping with just an id/status isn't
      // enough to render a new list entry.
      const fullOrder = await pool.query(
        `SELECT o.id, o.status, o.created_at, o.delivered_at,
                r.product_text, r.quantity, r.address_text AS request_address,
                r.fulfillment_type, r.delivery_address_text, r.recipient_name, r.recipient_phone,
                u.phone AS requester_phone,
                of.id AS offer_id, of.price, of.delivery_fee, of.delivery_eta_minutes
         FROM orders o
         JOIN offers of ON of.id = o.offer_id
         JOIN requests r ON r.id = o.request_id
         JOIN users u ON u.id = r.requester_id
         WHERE o.id = $1`,
        [orderResult.rows[0].id]
      );
      io.to(`vendor:${offer.vendor_id}`).emit('order:new', fullOrder.rows[0]);

      // Let the vendor know even if their dashboard tab isn't open right now.
      notifyUsersByPush([offer.vendor_id], {
        title: 'Your offer was accepted!',
        body: `Get moving on: ${fullOrder.rows[0].product_text}`,
        order_id: orderResult.rows[0].id,
        url: '/vendor.html',
      }).catch((err) => console.error('Push notification failed:', err));

      res.json({ order: orderResult.rows[0] });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Failed to accept offer' });
    } finally {
      if (client) client.release();
    }
  });

  // Shared lookup: fetch the offer plus enough context (vendor_id,
  // request_id, requester_id) to authorize a message and know which
  // socket rooms to notify. Returns null if the offer doesn't exist.
  async function getOfferContext(offerId) {
    const { rows } = await pool.query(
      `SELECT o.id AS offer_id, o.vendor_id, o.request_id, r.requester_id
       FROM offers o JOIN requests r ON r.id = o.request_id
       WHERE o.id = $1`,
      [offerId]
    );
    return rows[0] || null;
  }

  // GET /api/offers/:id/messages - only the requester who placed the request
  // or the vendor who made this specific offer can see this thread.
  router.get('/:id/messages', requireAuth, async (req, res) => {
    try {
      const ctx = await getOfferContext(req.params.id);
      if (!ctx) return res.status(404).json({ error: 'Offer not found' });
      if (req.user.id !== ctx.requester_id && req.user.id !== ctx.vendor_id) {
        return res.status(403).json({ error: 'Not authorized to view this conversation' });
      }
      const { rows } = await pool.query(
        `SELECT id, offer_id, sender_id, body, created_at FROM offer_messages
         WHERE offer_id = $1 ORDER BY created_at ASC LIMIT 200`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // POST /api/offers/:id/messages  { body }
  router.post('/:id/messages', requireAuth, async (req, res) => {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'body is required' });
    }
    if (containsProhibitedContent(body)) {
      return flagAndReject(pool, req, res, 'offer_message', body);
    }
    try {
      const ctx = await getOfferContext(req.params.id);
      if (!ctx) return res.status(404).json({ error: 'Offer not found' });

      const isRequester = req.user.id === ctx.requester_id;
      const isVendor = req.user.id === ctx.vendor_id;
      if (!isRequester && !isVendor) {
        return res.status(403).json({ error: 'Not authorized to message in this conversation' });
      }
      // A vendor still needs an active subscription to participate, same rule
      // as responding to requests in the first place - a lapsed subscription
      // shouldn't let them keep negotiating for free.
      if (isVendor && !(await isVendorPaidUp(req.user.id))) {
        const settings = await getSettings();
        return res.status(402).json({
          error: 'An active subscription is required to message requesters',
          subscription_required: true,
          price: settings.subscription_price,
          currency: settings.subscription_currency,
          ecocash_number: settings.ecocash_number,
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO offer_messages (offer_id, sender_id, body) VALUES ($1, $2, $3)
         RETURNING id, offer_id, sender_id, body, created_at`,
        [req.params.id, req.user.id, body.trim()]
      );
      const savedMessage = rows[0];

      // Deliver live to whichever side is watching - the requester's
      // request room, and the vendor's own room.
      io.to(`request:${ctx.request_id}`).emit('offer:message', savedMessage);
      io.to(`vendor:${ctx.vendor_id}`).emit('offer:message', savedMessage);

      // Push-notify whichever party didn't send this message, in case their
      // tab isn't open right now.
      const recipientId = isRequester ? ctx.vendor_id : ctx.requester_id;
      notifyUsersByPush([recipientId], {
        title: 'New message',
        body: body.trim().slice(0, 120),
        offer_id: req.params.id,
        url: isRequester ? '/vendor.html' : '/',
      }).catch((err) => console.error('Push notification failed:', err));

      res.status(201).json(savedMessage);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  return router;
};
