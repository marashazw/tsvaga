-- Extends how long a request stays in "My Requests" before auto-expiring,
-- from 5 to 30 days.

-- Updates the column default so every new request created from now on gets
-- 30 days (the INSERT in requests.js doesn't set visible_until explicitly,
-- it relies entirely on this default).
ALTER TABLE requests ALTER COLUMN visible_until SET DEFAULT (now() + interval '30 days');

-- Retroactively extends anything currently still active under the old
-- 5-day policy, recalculated from each request's own creation date - so a
-- request made a few days ago gets the same 30-day window it would have
-- gotten had it been created after this change, rather than an arbitrary
-- flat extension. Requests already 'infinity' (delivered - see the
-- separate "keep delivered permanently" fix) or already expired are left
-- untouched.
UPDATE requests
SET visible_until = created_at + interval '30 days'
WHERE visible_until != 'infinity'
  AND visible_until > now();
