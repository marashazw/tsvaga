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
