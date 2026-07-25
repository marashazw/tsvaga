import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import MapView from './components/MapView.jsx';
import RequestForm from './components/RequestForm.jsx';
import OfferList from './components/OfferList.jsx';
import OrderTracker from './components/OrderTracker.jsx';
import { api, loadStoredToken } from './api';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function App() {
  const [location, setLocation] = useState(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [request, setRequest] = useState(null);
  const [offers, setOffers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    loadStoredToken();
    const token = localStorage.getItem('tsvaga_token');
    const s = io(SOCKET_BASE, { auth: { token } });
    setSocket(s);
    return () => s.disconnect();
  }, []);

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

  async function handleSubmitRequest({ product_text, quantity }) {
    setSubmitting(true);
    try {
      const { data } = await api.post('/requests', {
        product_text,
        quantity,
        lng: location.lng,
        lat: location.lat,
        radius_km: radiusKm,
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

  return (
    <div className="app-shell">
      <header>
        <h1>Tsvaga</h1>
        <p className="tagline">Ask for what you want. Nearby stores come to you.</p>
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
