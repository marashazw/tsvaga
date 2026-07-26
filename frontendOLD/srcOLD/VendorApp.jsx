import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import MapView from './components/MapView.jsx';
import VendorAuth from './components/VendorAuth.jsx';
import InventoryManager from './components/InventoryManager.jsx';
import IncomingRequests from './components/IncomingRequests.jsx';
import VendorOrders from './components/VendorOrders.jsx';
import VendorReviews from './components/VendorReviews.jsx';
import SubscriptionPanel from './components/SubscriptionPanel.jsx';
import { api, loadStoredToken, setAuthToken } from './api';
import { enablePushNotifications } from './push';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function VendorApp() {
  const [authed, setAuthed] = useState(false);
  const [vendor, setVendor] = useState(null); // { id, business_name, is_online, lng, lat, inventory }
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [respondedIds, setRespondedIds] = useState(new Set());
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [pushStatus, setPushStatus] = useState(null); // null | 'granted' | 'denied' | 'unsupported' | 'not-configured'
  const [paywallNotice, setPaywallNotice] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSubscription = useCallback(async () => {
    const { data } = await api.get('/vendors/me/subscription');
    setSubscriptionInfo(data);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/vendors/me');
      setVendor(data);
      setAuthed(true);
      const { data: myOrders } = await api.get('/vendors/me/orders');
      setOrders(myOrders);
      const { data: myReviews } = await api.get(`/vendors/${data.id}/reviews`);
      setReviews(myReviews);
      await loadSubscription();
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, [loadSubscription]);

  useEffect(() => {
    const token = loadStoredToken();
    if (token) loadProfile();
    else setLoading(false);
  }, [loadProfile]);

  // Connect socket once we know who we are, and subscribe to our vendor room.
  useEffect(() => {
    if (!vendor) return;
    const token = localStorage.getItem('tsvaga_token');
    const s = io(SOCKET_BASE, { auth: { token } });
    s.on('connect', () => s.emit('vendor:subscribe', vendor.id));
    s.on('request:new', (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 20)));
    s.on('order:status', (payload) =>
      setOrders((prev) => prev.map((o) => (o.id === payload.order_id ? { ...o, status: payload.status } : o)))
    );
    s.on('review:new', (payload) =>
      setReviews((prev) => [{ id: `${payload.order_id}-temp`, rating: payload.rating, comment: payload.comment, created_at: new Date().toISOString() }, ...prev])
    );
    setSocket(s);
    return () => s.disconnect();
  }, [vendor?.id]);

  async function toggleOnline() {
    const { data } = await api.patch('/vendors/me/status', { is_online: !vendor.is_online });
    setVendor((v) => ({ ...v, is_online: data.is_online }));
  }

  async function handlePickLocation(loc) {
    await api.post('/vendors/me/location', { lng: loc.lng, lat: loc.lat });
    setVendor((v) => ({ ...v, lng: loc.lng, lat: loc.lat }));
  }

  function handleOffered(requestId) {
    setRespondedIds((prev) => new Set(prev).add(requestId));
  }

  function handlePaywalled(data) {
    setPaywallNotice(data);
    loadSubscription();
  }

  function handleOrderUpdated(updatedOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o)));
  }

  async function handleEnablePush() {
    const result = await enablePushNotifications();
    setPushStatus(result);
  }

  function handleLogout() {
    setAuthToken(null);
    setAuthed(false);
    setVendor(null);
    socket?.disconnect();
  }

  if (loading) return <div className="app-shell">Loading…</div>;

  if (!authed || !vendor) {
    return (
      <div className="app-shell">
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Vendor dashboard — manage stock and respond to nearby requests.</p>
        </header>
        <VendorAuth onAuthed={loadProfile} />
      </div>
    );
  }

  const vendorLocation = vendor.lat && vendor.lng ? { lat: vendor.lat, lng: vendor.lng } : null;

  return (
    <div className="app-shell">
      <header className="vendor-header">
        <div>
          <h1>{vendor.business_name}</h1>
          <p className="tagline">{vendor.address_text || 'Set your store location on the map below'}</p>
        </div>
        <div className="header-actions">
          <button className={vendor.is_online ? 'status-btn online' : 'status-btn offline'} onClick={toggleOnline}>
            {vendor.is_online ? '● Online — accepting requests' : '○ Offline'}
          </button>
          {pushStatus !== 'granted' && (
            <button className="secondary" onClick={handleEnablePush}>
              Enable notifications
            </button>
          )}
          <button className="secondary" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {pushStatus === 'granted' && (
        <p className="hint">Push notifications on — you'll be alerted even if this tab is closed.</p>
      )}
      {pushStatus === 'denied' && (
        <p className="hint">Notifications were blocked in your browser — enable them in browser settings to use this.</p>
      )}
      {pushStatus === 'not-configured' && (
        <p className="hint">Push isn't configured on this server yet (missing VAPID keys).</p>
      )}

      <section style={{ marginBottom: 20 }}>
        <SubscriptionPanel subscriptionInfo={subscriptionInfo} onSubmitted={loadSubscription} />
      </section>

      {paywallNotice && (
        <div className="panel subscription-panel unpaid" style={{ marginBottom: 20 }}>
          <strong>That request needs an active subscription to respond to.</strong>
          <p className="hint">
            Send ${Number(paywallNotice.price).toFixed(2)} {paywallNotice.currency} via EcoCash to{' '}
            {paywallNotice.ecocash_number}, then confirm it above.
          </p>
        </div>
      )}

      <main>
        <section className="map-section">
          <MapView requesterLocation={vendorLocation} onPickLocation={handlePickLocation} radiusKm={0} />
          <p className="hint">Tap the map to set or update your store's pin.</p>
        </section>

        <section className="panel">
          <h2>Nearby requests</h2>
          <IncomingRequests
            alerts={alerts}
            respondedIds={respondedIds}
            onResponded={handleOffered}
            onPaywalled={handlePaywalled}
          />
        </section>
      </main>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Orders to fulfill</h2>
        <VendorOrders orders={orders} onUpdated={handleOrderUpdated} />
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <VendorReviews reviews={reviews} ratingAvg={vendor.rating_avg} />
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <InventoryManager
          inventory={vendor.inventory || []}
          onChange={(inv) => setVendor((v) => ({ ...v, inventory: inv }))}
        />
      </section>
    </div>
  );
}
