const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { toGeoPoint, isWithinZimbabwe } = require('../utils/geo');
const { notifyUsersByPush } = require('../utils/pushSender');
const { isVendorPaidUp, getPaidVendorIdSet } = require('../utils/subscription');
const { sanitizeCategories } = require('../constants/categories');
const { containsProhibitedContent, flagAndReject } = require('../constants/prohibitedContent');

module.exports = function buildRequestsRouter(io) {
  const router = express.Router();

  // Shared by both request creation AND renewal - finds nearby vendors,
  // filters by category/inventory preference, and fans out the live socket
  // alert + push notification to each match. `request` needs: id, lng, lat,
  // product_id, product_text, quantity, address_text, radius_km,
  // fulfillment_type, delivery_address_text, recipient_name, recipient_phone,
  // categories, expires_at. Returns the number of vendors alerted.
  async function matchAndNotifyVendors({ client, request }) {
    const { lng, lat, product_id, product_text, categories, is_remote } = request;
    const finalCategories = categories && categories.length ? categories : ['miscellaneous'];
    // A remote service isn't tied to physical proximity at all (a designer
    // in Bulawayo can serve someone in Harare) - 1000km safely covers the
    // whole of Zimbabwe, so this effectively removes distance as a factor
    // without needing a separate un-filtered query path.
    const effectiveRadiusKm = is_remote ? 1000 : request.radius_km;

    const matchQuery = product_id
      ? `SELECT v.id, v.business_name, v.address_text, v.notify_categories, v.notify_mode,
                ST_Distance(v.location, ${toGeoPoint(lng, lat)}) AS distance_m
         FROM vendors v
         JOIN vendor_inventory vi ON vi.vendor_id = v.id
         WHERE vi.product_id = $1
           AND vi.in_stock = true
           AND v.is_online = true
           AND ST_DWithin(v.location, ${toGeoPoint(lng, lat)}, $2::numeric * 1000)
         ORDER BY distance_m ASC
         LIMIT 25`
      : `SELECT v.id, v.business_name, v.address_text, v.notify_categories, v.notify_mode,
                ST_Distance(v.location, ${toGeoPoint(lng, lat)}) AS distance_m
         FROM vendors v
         WHERE v.is_online = true
           AND ST_DWithin(v.location, ${toGeoPoint(lng, lat)}, $1::numeric * 1000)
         ORDER BY distance_m ASC
         LIMIT 25`;

    const matchParams = product_id ? [product_id, effectiveRadiusKm] : [effectiveRadiusKm];
    const nearbyVendors = await client.query(matchQuery, matchParams);

    // Category filter: a request tagged ONLY 'miscellaneous' (nothing more
    // specific was assigned) counts as a category match for everyone, since
    // it's genuinely uncategorized and could be anything.
    //
    // Each vendor's notify_mode decides how they're matched:
    //   'categories'                - category match only
    //   'categories_and_inventory'  - category match OR inventory match
    //   'inventory_only'            - inventory match only, category ignored
    const isGeneralRequest = finalCategories.length === 1 && finalCategories[0] === 'miscellaneous';

    const needsInventoryCheck = nearbyVendors.rows
      .filter((v) => v.notify_mode === 'inventory_only' || v.notify_mode === 'categories_and_inventory')
      .map((v) => v.id);
    const inventoryMatchedVendorIds = new Set();
    if (needsInventoryCheck.length) {
      const invResult = await client.query(
        `SELECT vi.vendor_id, vi.product_id, p.name
         FROM vendor_inventory vi JOIN products p ON p.id = vi.product_id
         WHERE vi.vendor_id = ANY($1::uuid[]) AND vi.in_stock = true`,
        [needsInventoryCheck]
      );
      const lowerProductText = product_text.toLowerCase();
      invResult.rows.forEach((row) => {
        const idMatch = product_id && row.product_id === product_id;
        const nameMatch =
          row.name &&
          (lowerProductText.includes(row.name.toLowerCase()) || row.name.toLowerCase().includes(lowerProductText));
        if (idMatch || nameMatch) inventoryMatchedVendorIds.add(row.vendor_id);
      });
    }

    const matches = {
      rows: nearbyVendors.rows.filter((v) => {
        const categoryMatch = isGeneralRequest || (v.notify_categories || []).some((c) => finalCategories.includes(c));
        const inventoryMatch = inventoryMatchedVendorIds.has(v.id);
        if (v.notify_mode === 'inventory_only') return inventoryMatch;
        if (v.notify_mode === 'categories_and_inventory') return categoryMatch || inventoryMatch;
        return categoryMatch;
      }),
    };

    const paidVendorIds = await getPaidVendorIdSet(matches.rows.map((v) => v.id));

    // Fan out real-time alerts to each matched vendor's room. Vendors without
    // an active subscription get a teaser (distance only, no product/address)
    // so they know something's nearby but must subscribe to see and respond.
    // Recipient contact info is withheld here entirely, even from paid-up
    // vendors - it's only revealed once their offer is actually accepted,
    // via GET /vendors/me/orders (which already includes it).
    matches.rows.forEach((vendor) => {
      const paidUp = paidVendorIds.has(vendor.id);
      io.to(`vendor:${vendor.id}`).emit('request:new', {
        request_id: request.id,
        product_text: paidUp ? request.product_text : null,
        quantity: paidUp ? request.quantity : null,
        address_text: paidUp ? request.address_text : null,
        fulfillment_type: request.fulfillment_type,
        delivery_address_text: paidUp ? request.delivery_address_text : null,
        request_type: request.request_type,
        is_remote: request.is_remote,
        dropoff_address_text: paidUp ? request.dropoff_address_text : null,
        recipient_name: null,
        recipient_phone: null,
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

    return matches.rows.length;
  }

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
      request_type,
      is_remote,
      dropoff_address_text,
    } = req.body;

    if (!product_text || typeof lng !== 'number' || typeof lat !== 'number') {
      return res.status(400).json({ error: 'product_text, lng, and lat are required' });
    }
    if (containsProhibitedContent(product_text) || containsProhibitedContent(quantity)) {
      return flagAndReject(pool, req, res, 'request', `${product_text} ${quantity || ''}`.trim());
    }
    if (!isWithinZimbabwe(lng, lat)) {
      return res.status(422).json({ error: 'Coordinates fall outside the supported Zimbabwe service area' });
    }
    const safeRequestType = request_type === 'service' ? 'service' : 'product';
    // Only a service can be remote - a product always needs a physical
    // delivery/pickup somewhere, so this flag is meaningless for products.
    const safeIsRemote = safeRequestType === 'service' && is_remote === true;
    const safeFulfillment = fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
    // A remote service (design, coding, tutoring over video call) has no
    // physical meeting point at all, so the location/address requirement
    // that applies to everything else doesn't apply here.
    if (!safeIsRemote && safeFulfillment === 'delivery' && !address_text?.trim() && !delivery_address_text?.trim()) {
      return res.status(400).json({
        error: 'Please set your location on the map, or provide a delivery/service address.',
      });
    }
    // Delivery address only makes sense for 'delivery' - ignore it for pickup
    // rather than storing something that would never be read.
    const safeDeliveryAddress = safeFulfillment === 'delivery' ? delivery_address_text || null : null;
    // Drop-off only makes sense for a transport/logistics service request.
    const safeDropoff =
      safeRequestType === 'service' && dropoff_address_text?.trim() ? dropoff_address_text.trim() : null;

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
        `INSERT INTO requests (requester_id, product_id, product_text, quantity, location, address_text, radius_km, fulfillment_type, delivery_address_text, recipient_name, recipient_phone, categories, request_type, is_remote, dropoff_address_text)
         VALUES ($1, $2, $3, $4, ${toGeoPoint(lng, lat)}, $5, COALESCE($6, 5), $7, $8, $9, $10, $11, $12, $13, $14)
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
          safeRequestType,
          safeIsRemote,
          safeDropoff,
        ]
      );
      const request = insertResult.rows[0];

      const alertedCount = await matchAndNotifyVendors({ client, request: { ...request, lng, lat } });

      res.status(201).json({ request, alerted_vendors: alertedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create request' });
    } finally {
      if (client) client.release();
    }
  });

  // GET /api/requests/me - the signed-in requester's own request history,
  // newest first. Placed BEFORE /:id below - otherwise Express would treat
  // "me" as if it were a request id and this would never be reached.
  // Requests past their visible_until (5 days, unless renewed) are simply
  // excluded here - they still exist in the database, just no longer shown.
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, product_text, quantity, status, fulfillment_type, request_type, created_at, visible_until,
                (SELECT COUNT(*) FROM offers WHERE offers.request_id = requests.id) AS offer_count
         FROM requests
         WHERE requester_id = $1 AND visible_until > now() AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.user.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch your requests' });
    }
  });

  // POST /api/requests/:id/renew
  // Re-broadcasts this request to nearby vendors right now, exactly like a
  // fresh request - not just a timestamp bump. Resets status to 'open',
  // gives it a new 30-minute vendor-response window, extends its 5-day
  // My Requests visibility, and re-runs the same matching/notification
  // pipeline used at creation. Blocked once a vendor's already been matched
  // or the order completed - re-broadcasting at that point wouldn't make sense.
  router.post('/:id/renew', requireAuth, async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      const existing = await client.query(
        `SELECT id, requester_id, product_id, product_text, quantity, address_text, radius_km,
                fulfillment_type, delivery_address_text, recipient_name, recipient_phone, categories, status, deleted_at,
                request_type, is_remote, dropoff_address_text,
                ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
         FROM requests WHERE id = $1`,
        [req.params.id]
      );
      if (!existing.rows.length) {
        return res.status(404).json({ error: 'Request not found' });
      }
      const current = existing.rows[0];
      if (current.requester_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to renew this request' });
      }
      if (current.deleted_at) {
        return res.status(410).json({ error: 'This request has been deleted' });
      }
      if (current.status === 'matched' || current.status === 'completed') {
        return res.status(409).json({ error: "This request has already been matched and can't be renewed" });
      }

      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE requests SET status = 'open', expires_at = now() + interval '30 minutes',
                visible_until = now() + interval '5 days'
         WHERE id = $1 RETURNING *`,
        [current.id]
      );
      const freshRequest = { ...updated.rows[0], lng: current.lng, lat: current.lat };

      const alertedCount = await matchAndNotifyVendors({ client, request: freshRequest });

      await client.query('COMMIT');
      res.json({ request: updated.rows[0], alerted_vendors: alertedCount });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Failed to renew request' });
    } finally {
      if (client) client.release();
    }
  });

  // PATCH /api/requests/:id  { product_text?, quantity? }
  // Only while still 'open' - once a vendor's been matched/an order exists,
  // changing what was actually asked for would be confusing/unsafe.
  router.patch('/:id', requireAuth, async (req, res) => {
    const { product_text, quantity } = req.body;
    if (containsProhibitedContent(product_text) || containsProhibitedContent(quantity)) {
      return flagAndReject(pool, req, res, 'request', `${product_text || ''} ${quantity || ''}`.trim());
    }
    try {
      const existing = await pool.query('SELECT requester_id, status, deleted_at FROM requests WHERE id = $1', [req.params.id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Request not found' });
      if (existing.rows[0].requester_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to edit this request' });
      }
      if (existing.rows[0].deleted_at) {
        return res.status(410).json({ error: 'This request has been deleted' });
      }
      if (existing.rows[0].status !== 'open') {
        return res.status(409).json({ error: 'Only an open request (not yet matched) can be edited' });
      }
      const result = await pool.query(
        `UPDATE requests SET product_text = COALESCE($2, product_text), quantity = COALESCE($3, quantity)
         WHERE id = $1 RETURNING id, product_text, quantity`,
        [req.params.id, product_text || null, quantity || null]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update request' });
    }
  });

  // DELETE /api/requests/:id
  // Blocked if a real order exists against it (matched/completed with actual
  // fulfillment history) - deleting that would break the order's own
  // reference to this request. A still-open or otherwise order-less request
  // can be deleted freely (cascades to its offers/messages).
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const existing = await pool.query('SELECT requester_id FROM requests WHERE id = $1', [req.params.id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Request not found' });
      if (existing.rows[0].requester_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this request' });
      }
      const hasOrder = await pool.query('SELECT 1 FROM orders WHERE request_id = $1', [req.params.id]);
      if (hasOrder.rows.length) {
        return res.status(409).json({ error: 'This request has an order on it and cannot be deleted' });
      }
      await pool.query('UPDATE requests SET deleted_at = now() WHERE id = $1', [req.params.id]);
      res.json({ deleted: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete request' });
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

      // A vendor viewer only sees recipient contact info if THEIR OWN offer
      // on this request was the one accepted - not just for being paid up.
      const hasAcceptedOffer = isVendorViewer && offers.rows.some((o) => o.vendor_id === req.user.id && o.status === 'accepted');
      if (isVendorViewer && !hasAcceptedOffer) {
        res.json({ request: { ...requestRow, recipient_name: null, recipient_phone: null }, offers: offers.rows });
        return;
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
                recipient_name, recipient_phone, created_at, request_type, is_remote, dropoff_address_text,
                ST_Distance(location, ${toGeoPoint(parseFloat(lng), parseFloat(lat))}) AS distance_m
         FROM requests
         WHERE status = 'open' AND deleted_at IS NULL
           AND (is_remote = true OR ST_DWithin(location, ${toGeoPoint(parseFloat(lng), parseFloat(lat))}, $1::numeric * 1000))
         ORDER BY created_at DESC
         LIMIT 100`,
        [radius_km || 5]
      );

      const paidUp = req.user.role === 'admin' || (await isVendorPaidUp(req.user.id));
      if (paidUp) {
        // Recipient contact info is withheld even here - only revealed once
        // an offer is actually accepted, via GET /vendors/me/orders.
        return res.json(result.rows.map((r) => ({ ...r, recipient_name: null, recipient_phone: null })));
      }

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
          request_type: r.request_type,
          is_remote: r.is_remote,
          dropoff_address_text: null,
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

  // GET /api/requests/:id/suggested-vendors - searches vendor inventories
  // for items matching this request's free-text description, so the
  // requester gets an immediate alternative to waiting for a broadcast
  // offer: vendors who already have it in stock at a known price, right
  // now. Matches on name/synonym text (with prefix matching for word-form
  // variations like plumber/plumbing) OR shared category (catches cases
  // with no shared word root at all, like "tutor" vs "teacher" - both tag
  // as 'tutoring_lessons' via the same keyword detector used at product
  // creation, see constants/categoryKeywords.js). Only surfaces paid-up
  // vendors (waived or active subscription), consistent with the rest of
  // the app's "pay to be reachable" model.
  router.get('/:id/suggested-vendors', requireAuth, async (req, res) => {
    try {
      const requestRow = await pool.query(
        `SELECT product_text, radius_km, requester_id, request_type, is_remote, categories,
                ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
         FROM requests WHERE id = $1`,
        [req.params.id]
      );
      if (!requestRow.rows.length) return res.status(404).json({ error: 'Request not found' });
      const r = requestRow.rows[0];
      if (r.requester_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to view suggestions for this request' });
      }

      // Meaningful search words (3+ chars, deduplicated) from the free-text
      // description, matched against both the product's canonical name and
      // its synonyms - e.g. "mealie meal" should also match a product whose
      // name is "maize meal" if that's listed as a synonym.
      // Prefixes rather than whole words - "plumber" and "plumbing" share
      // "plumb" but neither is a substring of the other, so whole-word
      // matching was silently missing exactly this kind of common word-form
      // variation (electrician/electrical, clean/cleaning, etc). A short
      // prefix bridges these. This can occasionally over-match (e.g.
      // "generator" and "general" share a prefix) - that's an acceptable
      // tradeoff here, since a false positive just means one extra,
      // easily-ignored suggestion, while a false negative means a real,
      // relevant vendor stays invisible entirely.
      const words = [
        ...new Set(
          r.product_text
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length >= 3)
            .map((w) => (w.length > 5 ? w.slice(0, 5) : w))
        ),
      ];
      if (!words.length) return res.json([]);
      const likePatterns = words.map((w) => `%${w}%`);
      // Same nationwide-match behavior as the broadcast alert flow - a
      // remote service isn't tied to physical proximity at all.
      const effectiveRadiusKm = r.is_remote ? 1000 : r.radius_km || 35;

      const { rows } = await pool.query(
        `SELECT vi.typical_price, vi.pricing_type, v.id AS vendor_id, v.business_name, v.address_text,
                u.phone AS vendor_phone, p.name AS product_name,
                CASE WHEN v.priority_expires_at > now() THEN v.priority_score ELSE 0 END AS vendor_priority,
                ST_Distance(v.location, ${toGeoPoint(r.lng, r.lat)}) AS distance_m
         FROM vendor_inventory vi
         JOIN vendors v ON v.id = vi.vendor_id
         JOIN users u ON u.id = v.id
         JOIN products p ON p.id = vi.product_id
         JOIN subscriptions s ON s.vendor_id = v.id
           AND (s.status = 'waived' OR (s.status = 'active' AND s.expires_at > now()))
         WHERE vi.in_stock = true
           AND v.is_online = true
           AND u.is_blocked = false
           AND p.type = $3
           AND ST_DWithin(v.location, ${toGeoPoint(r.lng, r.lat)}, $2::numeric * 1000)
           AND (
             p.name ILIKE ANY($1)
             OR EXISTS (SELECT 1 FROM unnest(p.synonyms) syn WHERE syn ILIKE ANY($1))
             OR p.category = ANY($4::text[])
           )
         ORDER BY (CASE WHEN v.priority_expires_at > now() THEN v.priority_score ELSE 0 END) DESC,
                  vi.typical_price ASC NULLS LAST
         LIMIT 20`,
        [likePatterns, effectiveRadiusKm, r.request_type, r.categories || []]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch suggested vendors' });
    }
  });

  return router;
};
