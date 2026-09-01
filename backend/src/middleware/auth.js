const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Checked on every request, not just at login, so a block takes effect
    // immediately even for someone with an already-active session/token -
    // otherwise a blocked user could keep acting until their token expires.
    const { rows } = await pool.query('SELECT is_blocked FROM users WHERE id = $1', [payload.id]);
    if (rows.length && rows[0].is_blocked) {
      return res.status(403).json({ error: 'This account has been blocked.' });
    }
    req.user = payload; // { id, role, phone }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
