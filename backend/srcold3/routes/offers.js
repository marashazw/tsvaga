const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { isVendorPaidUp, getSettings } = require('../utils/subscription');

module.exports = function buildOffersRouter(io) {
  const router = express.Router();

  // POST /api/requests/:requestId/offers  { price, delivery_fee?, delivery_eta_minutes, message }
  router.post('/:requestId/offers', requireAuth, async (req, res) => {
    const { requestId } = req.params;
    const { price, delivery_fee, delivery_eta_minutes, message } = req.body;
    if (typeof price !== 'number' || typeof delivery_eta_minutes !== 'number') {
      return res.status(400).json({ error: 'price and delivery_eta_minutes (numbers) are required' });
    }
    if (delivery_fee !== undefined && (typeof delivery_fee !== 'number' || delivery_fee < 0)) {
      return res.status(400).json({ error: 'delivery_fee must be a non-negative number if provided' });
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
        [requestId, req.user.id, price, delivery_fee || 0, delivery_eta_minutes, message || null]
      );
      const offer = result.rows[0];

      const vendorInfo = await pool.query('SELECT business_name, rating_avg FROM vendors WHERE id = $1', [req.user.id]);

      // Push the new offer live to whoever is watching this request.
      io.to(`request:${requestId}`).emit('offer:new', {
        ...offer,
        business_name: vendorInfo.rows[0]?.business_name,
        rating_avg: vendorInfo.rows[0]?.rating_avg,
      });

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
      io.to(`vendor:${offer.vendor_id}`).emit('order:status', orderResult.rows[0]);

      res.json({ order: orderResult.rows[0] });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Failed to accept offer' });
    } finally {
      if (client) client.release();
    }
  });

  return router;
};
