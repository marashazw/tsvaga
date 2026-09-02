const jwt = require('jsonwebtoken');

function attachSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // allow anonymous connections for read-only public map views
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // invalid token - continue unauthenticated rather than hard-fail the socket
    }
    next();
  });

  io.on('connection', (socket) => {
    // Authenticated users automatically join their own room, so the backend
    // can push "your requests list changed" events without the client
    // needing to explicitly subscribe per-request - this is what lets My
    // Requests update live (new offer arrived, request matched, order
    // status changed) regardless of which request is "active" right now.
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // A vendor joins their own room to receive `request:new` alerts.
    socket.on('vendor:subscribe', (vendorId) => {
      socket.join(`vendor:${vendorId}`);
    });

    // A requester (or anyone watching) joins a request's room to receive live offers.
    socket.on('request:subscribe', (requestId) => {
      socket.join(`request:${requestId}`);
    });

    socket.on('disconnect', () => {
      // Socket.io automatically cleans up room membership on disconnect.
    });
  });
}

module.exports = { attachSocketHandlers };
