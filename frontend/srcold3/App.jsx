import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import MapView from './components/MapView.jsx';
import RequestForm from './components/RequestForm.jsx';
import OfferList from './components/OfferList.jsx';
import OrderTracker from './components/OrderTracker.jsx';
import RequesterAuth from './components/RequesterAuth.jsx';
import { api, loadStoredToken, setAuthToken } from './api';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Default the pin to Harare CBD so there's already a sensible starting point -
  // the user can still tap the map to move it anywhere else in Zimbabwe.
  const HARARE_CBD = { lat: -17.8292, lng: 31.0522 };
  const [location, setLocation] = useState(HARARE_CBD);
  const [radiusKm, setRadiusKm] = useState(5);
  const [request, setRequest] = useState(null);
  const [offers, setOffers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);

  // On load, if there's a stored token, verify it actually belongs to a real
  // account (rather than just assuming any token present means "logged in") -
  // this is what makes sure a requester is a genuine, distinct identity rather
  // than silently reusing whatever token happens to be sitting in the browser.
  const checkAuth = useCallback(async () => {
    const token = loadStoredToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      setAuthed(true);
    } catch {
      setAuthToken(null);
      setAuthed(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authed) return;
    const token = localStorage.getItem('tsvaga_token');
    const s = io(SOCKET_BASE, { auth: { token } });
    setSocket(s);
    return () => s.disconnect();
  }, [authed]);

  useEffect(() => {
    if (!socket || !request) return;
    socket.emit('request:subscribe', request.id);

    const onOffer = (offer) => setOffers((prev) => [...prev.filter((o) => o.id !== offer.id), offer]);
    const onOrderStatus = (payload) => setOrder((prev) => (prev ? { ...prev, status: payload.status } : prev));

    socket.on('offer:new', onOffer);
    socket.on('order:status', onOrderStatus);
    return () => {
      socket.off('offer:new', onOffer);
      socket.off('order:status', onOrderStatus);
    };
  }, [socket, request]);

  const handlePickLocation = useCallback((loc) => setLocation(loc), []);

  function handleAuthed(userData) {
    setUser(userData);
    setAuthed(true);
  }

  function handleLogout() {
    setAuthToken(null);
    setAuthed(false);
    setUser(null);
    socket?.disconnect();
    setRequest(null);
    setOffers([]);
    setOrder(null);
  }

  async function handleSubmitRequest({ product_text, quantity, fulfillment_type, delivery_address_text }) {
    setSubmitting(true);
    try {
      const { data } = await api.post('/requests', {
        product_text,
        quantity,
        lng: location.lng,
        lat: location.lat,
        radius_km: radiusKm,
        fulfillment_type,
        delivery_address_text,
      });
      setRequest(data.request);
      setOffers([]);
      setOrder(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptOffer(offerId) {
    try {
      const { data } = await api.patch(`/offers/${offerId}/accept`);
      // Fetch the full order (with vendor/product detail) for the tracker screen.
      const { data: fullOrder } = await api.get(`/orders/${data.order.id}`);
      setOrder(fullOrder);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept offer');
    }
  }

  function startOver() {
    setRequest(null);
    setOffers([]);
    setOrder(null);
  }

  if (checkingAuth) return <div className="app-shell">Loading…</div>;

  if (!authed) {
    return (
      <div className="app-shell">
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Ask for what you want. Nearby stores come to you.</p>
        </header>
        <RequesterAuth onAuthed={handleAuthed} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="vendor-header">
        <div>
          <h1>Tsvaga</h1>
          <p className="tagline">Hi {user.name} — ask for what you want. Nearby stores come to you.</p>
        </div>
        <button className="secondary" onClick={handleLogout}>Sign out</button>
      </header>

      <main>
        <section className="map-section">
          <MapView requesterLocation={location} onPickLocation={handlePickLocation} radiusKm={radiusKm} />
        </section>

        <section className="panel">
          {!request ? (
            <RequestForm
              location={location}
              radiusKm={radiusKm}
              onRadiusChange={setRadiusKm}
              onSubmit={handleSubmitRequest}
              submitting={submitting}
            />
          ) : order ? (
            <>
              <OrderTracker order={order} />
              {(order.status === 'delivered' || order.status === 'cancelled') && (
                <button className="secondary" onClick={startOver} style={{ marginTop: 12 }}>
                  Start a new request
                </button>
              )}
            </>
          ) : (
            <div className="request-status">
              <h2>{request.product_text}</h2>
              <p className="hint">
                {request.fulfillment_type === 'pickup'
                  ? "You'll collect this yourself."
                  : request.delivery_address_text
                    ? `Deliver to: ${request.delivery_address_text}`
                    : 'Deliver to your pinned location.'}
              </p>
              <p className="hint">Live offers from nearby stores:</p>
              <OfferList offers={offers} onAccept={handleAcceptOffer} matched={false} />
              <button className="secondary" onClick={startOver}>
                Cancel and start over
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
