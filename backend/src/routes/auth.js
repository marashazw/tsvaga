const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { toGeoPoint } = require('../utils/geo');
const { CATEGORIES } = require('../constants/categories');
const { containsProhibitedContent, flagAndReject } = require('../constants/prohibitedContent');

const router = express.Router();

// Geographic center of Zimbabwe - used as a placeholder location for new vendors
// until they set their real pin from the dashboard.
const ZW_CENTER = { lng: 29.1549, lat: -19.0154 };

// POST /api/auth/register
// For vendors, also pass business_name (defaults to name) and optionally lng/lat.
router.post('/register', async (req, res) => {
  const { name, phone, password, role, business_name, lng, lat, address_text, captcha_token, captcha_answer } =
    req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'name, phone, and password are required' });
  }
  if (containsProhibitedContent(name) || containsProhibitedContent(business_name)) {
    // req.user doesn't exist yet at registration time - flagAndReject
    // handles that gracefully by recording the flag with no user_id.
    return flagAndReject(pool, req, res, 'registration', `${name} ${business_name || ''}`.trim());
  }

  // Verify the math captcha before touching the database at all - stops
  // basic spam bots without needing any server-side session/state, since
  // the correct answer is embedded (signed) inside the token itself.
  if (!captcha_token || captcha_answer === undefined || captcha_answer === null || captcha_answer === '') {
    return res.status(400).json({ error: 'Please answer the verification question' });
  }
  try {
    const captchaPayload = jwt.verify(captcha_token, process.env.JWT_SECRET);
    if (captchaPayload.type !== 'captcha' || Number(captcha_answer) !== captchaPayload.answer) {
      return res.status(400).json({ error: 'That answer is incorrect - please try again', captcha_failed: true });
    }
  } catch (err) {
    return res
      .status(400)
      .json({ error: 'Verification question expired - please try again', captcha_failed: true });
  }

  const allowedRoles = ['requester', 'vendor', 'both'];
  const safeRole = allowedRoles.includes(role) ? role : 'requester';
  // Admin accounts are never created through public self-registration - see
  // `npm run create:admin` for the only way to create/promote one.
  let client;
  try {
    client = await pool.connect();
    const existing = await client.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this phone number already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (name, phone, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, role, created_at`,
      [name, phone, safeRole, passwordHash]
    );
    const user = result.rows[0];

    if (user.role === 'vendor' || user.role === 'both') {
      const point = toGeoPoint(
        typeof lng === 'number' ? lng : ZW_CENTER.lng,
        typeof lat === 'number' ? lat : ZW_CENTER.lat
      );
      // Explicitly pass the full category list at registration (rather than
      // relying solely on the column's DB-level default) so this stays true
      // even if the default ever changes for future signups only.
      await client.query(
        `INSERT INTO vendors (id, business_name, location, address_text, is_online, notify_categories)
         VALUES ($1, $2, ${point}, $3, true, $4)`,
        [user.id, business_name || name, address_text || null, CATEGORIES]
      );

      // Auto-trial: only if enabled by the admin AND this phone number has
      // never had one before (checked/recorded in vendor_trial_usage, which
      // survives even if the account itself is later deleted - so deleting
      // and re-registering with the same phone can't earn a second trial).
      const settings = await client.query(
        'SELECT auto_waive_new_vendors, auto_waive_days FROM platform_settings WHERE id = 1'
      );
      const { auto_waive_new_vendors, auto_waive_days } = settings.rows[0];

      let grantedTrial = false;
      if (auto_waive_new_vendors) {
        const alreadyUsed = await client.query('SELECT 1 FROM vendor_trial_usage WHERE phone = $1', [phone]);
        if (!alreadyUsed.rows.length) {
          await client.query('INSERT INTO vendor_trial_usage (phone) VALUES ($1)', [phone]);
          grantedTrial = true;
        }
      }

      if (grantedTrial) {
        await client.query(
          `INSERT INTO subscriptions (vendor_id, status, expires_at, note)
           VALUES ($1, 'active', now() + ($2 || ' days')::interval, 'Free trial (auto-granted at registration)')
           ON CONFLICT (vendor_id) DO NOTHING`,
          [user.id, auto_waive_days]
        );
      } else {
        await client.query(
          `INSERT INTO subscriptions (vendor_id, status) VALUES ($1, 'inactive') ON CONFLICT (vendor_id) DO NOTHING`,
          [user.id]
        );
      }
    }
    await client.query('COMMIT');

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    res.status(201).json({ user, token });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to register user' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'phone and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid phone number or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid phone number or password' });

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    delete user.password_hash;
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// GET /api/auth/me - confirms who's actually signed in (used by the frontend to
// gate pages and show a name), rather than just trusting that a token exists.
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, phone, role, created_at FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Shared by both deletion endpoints below - scrubs identity beyond recovery
// rather than a literal row delete (see the longer explanation on the public
// endpoint further down for why).
async function anonymizeAccount(client, user) {
  if (user.role === 'vendor' || user.role === 'both') {
    await client.query(
      `UPDATE vendors SET business_name = 'Deleted vendor', is_online = false WHERE id = $1`,
      [user.id]
    );
  }
  const deadPasswordHash = await bcrypt.hash(require('crypto').randomUUID(), 10);
  await client.query(
    `UPDATE users SET name = 'Deleted user', phone = $2, password_hash = $3 WHERE id = $1`,
    [user.id, `deleted-${user.id}`, deadPasswordHash]
  );
  await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [user.id]);
}

// DELETE /api/auth/me  { password }
// The in-app "Delete my account" flow - already signed in, just re-confirms
// the password as a safety check before doing something irreversible.
router.delete('/me', require('../middleware/auth').requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Please enter your password to confirm' });
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be self-deleted - contact support' });
    }

    await client.query('BEGIN');
    await anonymizeAccount(client, user);
    await client.query('COMMIT');
    res.json({ deleted: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account - please try again' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/auth/delete-account  { phone, password }
//
// Public (no auth token required) so someone can delete their account from a
// plain web page even without the app installed or being logged in -
// satisfying Google Play's account deletion requirement (in-app path + web
// path). Identity is verified the same way as login: phone + password.
//
// This ANONYMIZES rather than hard-deletes the row. A literal DELETE would
// violate foreign key constraints the moment this person has any order or
// review history (orders.request_id has no ON DELETE CASCADE, deliberately -
// see the schema notes), and just as importantly, the other party to a past
// order has a legitimate interest in that transaction record still existing.
// Instead: name/phone/password are scrubbed beyond recovery (phone is
// replaced with a unique dead value, password with an unguessable hash, so
// the account can never be logged into or matched by phone again), any
// vendor profile is taken offline and its business name scrubbed too, and
// all push subscriptions are removed outright. This is disclosed in the
// privacy policy as the retention approach for historical transaction data.
router.post('/delete-account', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'phone and password are required' });
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid phone number or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid phone number or password' });

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be self-deleted - contact support' });
    }

    await client.query('BEGIN');
    await anonymizeAccount(client, user);
    await client.query('COMMIT');
    res.json({ deleted: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account - please try again' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
