-- One-time backfill: any request whose order was already delivered before
-- the "keep delivered requests permanently" fix went live never had its
-- visible_until extended, since that only happens at the moment of the
-- PATCH /orders/:id/status call itself. This catches everything already
-- delivered up to now. Safe to re-run - it's just a no-op for anything
-- already set to infinity.

UPDATE requests r
SET visible_until = 'infinity'
FROM orders o
WHERE o.request_id = r.id
  AND o.status = 'delivered'
  AND r.visible_until != 'infinity';
