require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { attachSocketHandlers } = require('./config/socket');

const authRoutes = require('./routes/auth');
const vendorRoutes = require('./routes/vendors');
const productRoutes = require('./routes/products');
const pushRoutes = require('./routes/push');
const adminRoutes = require('./routes/admin');
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
app.use('/api/vendors', pushRoutes); // adds POST/DELETE /me/push-subscription
app.use('/api/push', pushRoutes); // adds GET /public-key
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
const offersRouter = buildOffersRouter(io);
app.use('/api/requests', buildRequestsRouter(io));
app.use('/api/requests', offersRouter); // adds POST /:requestId/offers
app.use('/api/offers', offersRouter); // adds PATCH /:id/accept
app.use('/api/orders', buildOrdersRouter(io));

attachSocketHandlers(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Tsvaga backend listening on port ${PORT}`);
});
