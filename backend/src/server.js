require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Safety net: without this, Node (since v15) terminates the *entire process*
// on any unhandled promise rejection. We've already fixed the known cases
// where a route let one slip through (a pool.connect() call sitting outside
// its try/catch), but this catches anything else so one bad request can't
// take the whole server down - it logs and keeps running instead.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server kept running):', reason);
});

const { attachSocketHandlers } = require('./config/socket');

const authRoutes = require('./routes/auth');
const vendorRoutes = require('./routes/vendors');
const productRoutes = require('./routes/products');
const pushRoutes = require('./routes/push');
const adminRoutes = require('./routes/admin');
const adsRoutes = require('./routes/ads');
const geocodeRoutes = require('./routes/geocode');
const captchaRoutes = require('./routes/captcha');
const buildRequestsRouter = require('./routes/requests');
const buildOffersRouter = require('./routes/offers');
const buildOrdersRouter = require('./routes/orders');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',');
const io = new Server(server, { cors: { origin: allowedOrigins } });

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tsvaga-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/vendors', pushRoutes); // adds POST/DELETE /me/push-subscription (vendor dashboard)
app.use('/api/users', pushRoutes); // adds POST/DELETE /me/push-subscription (requester app) + GET /public-key
app.use('/api/push', pushRoutes); // adds GET /public-key
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/captcha', captchaRoutes);
const offersRouter = buildOffersRouter(io);
app.use('/api/requests', buildRequestsRouter(io));
app.use('/api/requests', offersRouter); // adds POST /:requestId/offers
app.use('/api/offers', offersRouter); // adds PATCH /:id/accept
app.use('/api/orders', buildOrdersRouter(io));

attachSocketHandlers(io);

// Broadcast a live "how many people are online right now" count every 10s.
// io.engine.clientsCount is every open Socket.io connection (both the
// requester and vendor apps connect one each while their tab is open) - a
// simple, good-enough proxy for "online now" without extra bookkeeping.
setInterval(() => {
  io.emit('presence:count', { count: io.engine.clientsCount });
}, 10000);

// Housekeeping, run every hour:
// - Any ad submission still sitting 'pending' (never reviewed/paid-confirmed)
//   for more than 10 days is auto-deleted, rather than accumulating forever.
// - Any 'active' ad whose ends_at has passed gets flipped to 'expired' for
//   clean admin visibility (GET /api/ads/active already filters these out
//   regardless, this is just for bookkeeping).
const pool = require('./config/db');
async function runHousekeeping() {
  try {
    const deleted = await pool.query(
      `DELETE FROM ads WHERE status = 'pending' AND created_at < now() - interval '10 days' RETURNING id`
    );
    if (deleted.rows.length) {
      console.log(`Housekeeping: deleted ${deleted.rows.length} stale pending ad submission(s).`);
    }
    await pool.query(`UPDATE ads SET status = 'expired' WHERE status = 'active' AND ends_at <= now()`);
  } catch (err) {
    console.error('Housekeeping job failed:', err);
  }
}
runHousekeeping(); // once on startup
setInterval(runHousekeeping, 60 * 60 * 1000); // then every hour

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Tsvaga backend listening on port ${PORT}`);
});
