const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { toGeoPoint, isWithinZimbabwe } = require('../utils/geo');
const { notifyUsersByPush } = require('../utils/pushSender');
const { isVendorPaidUp, getPaidVendorIdSet } = require('../utils/subscription');
const { sanitizeCategories } = require('../constants/categories');

module.exports = function buildRequestsRouter(io) {
  const router = express.Router();

  // POST /api/requests  { product_text, product_id?, quantity, lng, lat, address_text, radius_km,
  //                        fulfillment_type?: 'delivery'|'pickup', delivery_address_text?,
  //                        recipient_name?, recipient_phone?, categories? }
  router.post('/', requireAuth, async (req, res) => {
    const {
      product_text,
      product_id,
      quantity,
      lng,
      lat,
      address_text,
      radius_km,
      fulfillment_type,
      delivery_address_text,
      recipient_name,
      recipient_phone,
      categories,
    } = req.body;

    if (!product_text || typeof lng !== 'number' || typeof lat !== 'number') {
      return res.status(400).json({ error: 'product_text, lng, and lat are required' });
    }
    if (!isWithinZimbabwe(lng, lat)) {
      return res.status(422).json({ error: 'Coordinates fall outside the supported Zimbabwe service area' });
    }
    const safeFulfillment = fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
    // Delivery address only makes sense for 'delivery' - ignore it for pickup
    // rather than storing something that would never be read.
    const safeDeliveryAddress = safeFulfillment === 'delivery' ? delivery_address_text || null : null;

    // A request always has at least one valid category - if the requester
    // (or the client's auto-suggestion) didn't assign anything usable, it
    // falls back to 'miscellaneous', which is what makes it broadcast to
    // every nearby vendor regardless of their individual preferences below.
    const safeCategories = sanitizeCategories(categories);
    const finalCategories = safeCategories.length ? safeCategories : ['miscellaneous'];

    let client;
    try {
      client = await pool.connect();
      const insertResult = await client.query(
        `INSERT INTO requests (requester_id, product_id, product_text, quantity, location, address_text, radius_km, fulfillment_type, delivery_address_text, recipient_name, recipient_phone, categories)
         VALUES ($1, $2, $3, $4, ${toGeoPoint(lng, lat)}, $5, COALESCE($6, 5), $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.user.id,
          product_id || null,
          product_text,
          quantity || null,
          address_text || null,
          radius_km || null,
          safeFulfillment,
          safeDeliveryAddress,
          recipient_name || null,
          recipient_phone || null,
          finalCategories,
        ]
      );
      const request = insertResult.rows[0];

      // Find nearby, online, in-stock vendors (falls back to "all online vendors nearby"
      // if the product wasn't matched to the catalog). notify_categories comes along
      // so we can filter by category preference just below.
      const matchQuery = product_id
        ? `SELECT v.id, v.business_name, v.address_text, v.notify_categories,
                  ST_Distance(v.location, ${toGeoPoint(lng, lat)}) AS distance_m
           FROM vendors v
           JOIN vendor_inventory vi ON vi.vendor_id = v.id
           WHERE vi.product_id = $1
             AND vi.in_stock = true
             AND v.is_online = true
             AND ST_DWithin(v.location, ${toGeoPoint(lng, lat)}, $2::numeric * 1000)
           ORDER BY distance_m ASC
           LIMIT 25`
        : `SELECT v.id, v.business_name, v.address_text, v.notify_categories,
                  ST_Distance(v.location, ${toGeoPoint(lng, lat)}) AS distance_m
           FROM vendors v
           WHERE v.is_online = true
             AND ST_DWithin(v.location, ${toGeoPoint(lng, lat)}, $1::numeric * 1000)
           ORDER BY distance_m ASC
           LIMIT 25`;

      const matchParams = product_id ? [product_id, request.radius_km] : [request.radius_km];
      const nearbyVendors = await client.query(matchQuery, matchParams);

      // Category filter: a request tagged ONLY 'miscellaneous' (nothing more
      // specific was assigned) goes to every nearby vendor, since it's
      // genuinely uncategorized and could be anything. Otherwise, only
      // vendors who've opted into at least one of this request's categories
      // get alerted.
      const isGeneralRequest = finalCategories.length === 1 && finalCategories[0] === 'miscellaneous';
      const matches = {
        rows: isGeneralRequest
          ? nearbyVendors.rows
          : nearbyVendors.rows.filter((v) =>
              (v.notify_categories || []).some((c) => finalCategories.includes(c))
            ),
      };

      const paidVendorIds = await getPaidVendorIdSet(matches.rows.map((v) => v.id));

      // Fan out real-time alerts to each matched vendor's room. Vendors without
      // an active subscription get a teaser (distance only, no product/address)
      // so they know something's nearby but must subscribe to see and respond.
      matches.rows.forEach((vendor) => {
        const paidUp = paidVendorIds.has(vendor.id);
        io.to(`vendor:${vendor.id}`).emit('request:new', {
          request_id: request.id,
          product_text: paidUp ? request.product_text : null,
          quantity: paidUp ? request.quantity : null,
          address_text: paidUp ? request.address_text : null,
          fulfillment_type: request.fulfillment_type,
          delivery_address_text: paidUp ? request.delivery_address_text : null,
          recipient_name: paidUp ? request.recipient_name : null,
          recipient_phone: paidUp ? request.recipient_phone : null,
          distance_m: Math.round(vendor.distance_m),
          expires_at: request.expires_at,
          subscription_required: !paidUp,
        });
      });

      // Push notifications reach vendors whose dashboard tab/app isn't open right
      // now (as long as they've enabled push once) - socket.io alerts above only
      // reach an actively open tab, so this is the "vendor is offline" fallback.
      // Same redaction applies: unpaid vendors get a generic teaser, not the
      // actual product/address.
      const paidVendorList = matches.rows.filter((v) => paidVendorIds.has(v.id)).map((v) => v.id);
      const unpaidVendorList = matches.rows.filter((v) => !paidVendorIds.has(v.id)).map((v) => v.id);

      notifyUsersByPush(paidVendorList, {
        title: `Someone nearby wants: ${request.product_text}`,
        body: request.address_text ? `Near ${request.address_text}` : 'Tap to view and send an offer',
        request_id: request.id,
        url: '/vendor.html',
      }).catch((err) => console.error('Push notification batch failed:', err));

      notifyUsersByPush(unpaidVendorList, {
        title: 'A nearby request just came in',
        body: 'Subscribe to see the details and respond',
        request_id: request.id,
        url: '/vendor.html',
      }).catch((err) => console.error('Push notification batch failed:', err));

      res.status(201).json({ request, alerted_vendors: matches.rows.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create request' });
    } finally {
      if (client) client.release();
    }
  });

  // GET /api/requests/:id  - request detail + offers so far
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const request = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
      if (!request.rows.length) return res.status(404).json({ error: 'Request not found' });
      const requestRow = request.rows[0];

      const offers = await pool.query(
        `SELECT o.*, v.business_name, v.rating_avg,
                CASE WHEN v.priority_expires_at > now() THEN v.priority_score ELSE 0 END AS vendor_priority
         FROM offers o JOIN vendors v ON v.id = o.vendor_id
         WHERE o.request_id = $1
         ORDER BY (CASE WHEN v.priority_expires_at > now() THEN v.priority_score ELSE 0 END) DESC, o.price ASC`,
        [req.params.id]
      );

      const isOwner = req.user.id === requestRow.requester_id;
      const isAdmin = req.user.role === 'admin';
      const isVendorViewer = !isOwner && !isAdmin && (req.user.role === 'vendor' || req.user.role === 'both');

      if (isVendorViewer && !(await isVendorPaidUp(req.user.id))) {
        return res.status(200).json({
          request: {
            id: requestRow.id,
            status: requestRow.status,
            expires_at: requestRow.expires_at,
            product_text: null,
            quantity: null,
            address_text: null,
            fulfillment_type: requestRow.fulfillment_type,
            delivery_address_text: null,
            recipient_name: null,
            recipient_phone: null,
          },
          offers: [],
          subscription_required: true,
        });
      }

      res.json({ request: requestRow, offers: offers.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch request' });
    }
  });

  // GET /api/requests/nearby?lng=&lat=&radius_km=  - vendor view of open requests near them
  router.get('/nearby/list', requireAuth, async (req, res) => {
    const { lng, lat, radius_km } = req.query;
    if (!lng || !lat) return res.status(400).json({ error: 'lng and lat query params are required' });
    try {
      const result = await pool.query(
        `SELECT id, product_text, quantity, address_text, expires_at, fulfillment_type, delivery_address_text,
                recipient_name, recipient_phone, created_at,
                ST_Distance(location, ${toGeoPoint(parseFloat(lng), parseFloat(lat))}) AS distance_m
         FROM requests
         WHERE status = 'open'
           AND ST_DWithin(location, ${toGeoPoint(parseFloat(lng), parseFloat(lat))}, $1::numeric * 1000)
         ORDER BY created_at DESC`,
        [radius_km || 5]
      );

      const paidUp = req.user.role === 'admin' || (await isVendorPaidUp(req.user.id));
      if (paidUp) return res.json(result.rows);

      // Unpaid vendor: teaser only - distance, expiry, and fulfillment type
      // (delivery vs pickup is safe to reveal on its own), no product/address.
      res.json(
        result.rows.map((r) => ({
          id: r.id,
          product_text: null,
          quantity: null,
          address_text: null,
          fulfillment_type: r.fulfillment_type,
          delivery_address_text: null,
          recipient_name: null,
          recipient_phone: null,
          expires_at: r.expires_at,
          created_at: r.created_at,
          distance_m: r.distance_m,
          subscription_required: true,
        }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch nearby requests' });
    }
  });

  return router;
};
