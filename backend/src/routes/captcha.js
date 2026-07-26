const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// GET /api/captcha - a simple arithmetic question to slow down basic spam
// bots at registration, without requiring a real user to do much work.
// Stateless by design: the correct answer is embedded in a signed, 5-minute
// token instead of being stored server-side anywhere - the frontend sends
// both the token and the typed answer back, and we just verify the signature
// and compare. No database table, no session store needed.
router.get('/', (req, res) => {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const token = jwt.sign({ type: 'captcha', answer: a + b }, process.env.JWT_SECRET, { expiresIn: '5m' });
  res.json({ question: `${a} + ${b} = ?`, token });
});

module.exports = router;
