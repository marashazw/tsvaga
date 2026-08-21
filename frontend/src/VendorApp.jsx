import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import MapView from './components/MapView.jsx';
import VendorAuth from './components/VendorAuth.jsx';
import InventoryManager from './components/InventoryManager.jsx';
import IncomingRequests from './components/IncomingRequests.jsx';
import VendorOrders from './components/VendorOrders.jsx';
import VendorTodoList from './components/VendorTodoList.jsx';
import VendorReviews from './components/VendorReviews.jsx';
import SubscriptionPanel from './components/SubscriptionPanel.jsx';
import PriorityPanel from './components/PriorityPanel.jsx';
import VendorCategoryPreferences from './components/VendorCategoryPreferences.jsx';
import AdSlot from './components/AdSlot.jsx';
import AdvertisingSection from './components/AdvertisingSection.jsx';
import OnlineCount from './components/OnlineCount.jsx';
import DeleteAccountLink from './components/DeleteAccountLink.jsx';
import { api, loadStoredToken, setAuthToken } from './api';
import { enablePushNotifications } from './push';
import InstallPrompt from './components/InstallPrompt.jsx';
const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function VendorApp() {
  const [authed, setAuthed] = useState(false);
  const [vendor, setVendor] = useState(null); // { id, business_name, is_online, lng, lat, inventory }
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [respondedIds, setRespondedIds] = useState(new Set());
  const [offerIdsByRequest, setOfferIdsByRequest] = useState({});
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [pushStatus, setPushStatus] = useState(null); // null | 'granted' | 'denied' | 'unsupported' | 'not-configured'
  const [paywallNotice, setPaywallNotice] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [mapOpenOverride, setMapOpenOverride] = useState(null); // null = use the smart default below
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const loadSubscription = useCallback(async () => {
    const { data } = await api.get('/vendors/me/subscription');
    setSubscriptionInfo(data);
  }, []);

  const loadNearbyRequests = useCallback(async (vendorData) => {
    if (typeof vendorData.lng !== 'number' || typeof vendorData.lat !== 'number') return;
    try {
      const { data } = await api.get('/requests/nearby/list', {
        params: { lng: vendorData.lng, lat: vendorData.lat, radius_km: 10 },
      });
      // Normalize field names to match what live socket alerts look like
      // (request_id, not id) so both sources render the same way.
      const normalized = data.map((r) => ({
        request_id: r.id,
        product_text: r.product_text,
        quantity: r.quantity,
        address_text: r.address_text,
        fulfillment_type: r.fulfillment_type,
        delivery_address_text: r.delivery_address_text,
        recipient_name: r.recipient_name,
        recipient_phone: r.recipient_phone,
        distance_m: r.distance_m,
        expires_at: r.expires_at,
        created_at: r.created_at,
        subscription_required: r.subscription_required,
      }));
      setAlerts(normalized);
    } catch (err) {
      console.error('Failed to load nearby requests', err);
    }
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
      await loadNearbyRequests(data);
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, [loadSubscription, loadNearbyRequests]);

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
    s.on('request:new', (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 100)));
    s.on('order:new', (order) =>
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]))
    );
    s.on('order:status', (payload) =>
      setOrders((prev) => prev.map((o) => (o.id === payload.order_id ? { ...o, status: payload.status } : o)))
    );
    s.on('review:new', (payload) =>
      setReviews((prev) => [{ id: `${payload.order_id}-temp`, rating: payload.rating, comment: payload.comment, created_at: new Date().toISOString() }, ...prev])
    );
    setSocket(s);
    return () => s.disconnect();
  }, [vendor?.id]);

  function startEditingName() {
    setNameInput(vendor.business_name);
    setEditingName(true);
  }

  async function saveShopName() {
    if (!nameInput.trim()) return;
    try {
      const { data } = await api.patch('/vendors/me/profile', { business_name: nameInput.trim() });
      setVendor((v) => ({ ...v, business_name: data.business_name }));
      setEditingName(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update shop name');
    }
  }

  async function toggleOnline() {
    const { data } = await api.patch('/vendors/me/status', { is_online: !vendor.is_online });
    setVendor((v) => ({ ...v, is_online: data.is_online }));
  }

  async function handlePickLocation(loc, addressLabel) {
    let label = addressLabel;
    if (!label) {
      // Came from a map click/drag rather than the search bar - look up a
      // human-readable address for the new spot instead of leaving the old
      // one stale (or blank for a brand-new vendor).
      try {
        const { data } = await api.get('/geocode/reverse', { params: { lat: loc.lat, lng: loc.lng } });
        label = data.display_name;
      } catch {
        label = undefined; // fine to just keep whatever address was already saved
      }
    }
    await api.post('/vendors/me/location', { lng: loc.lng, lat: loc.lat, address_text: label || undefined });
    setVendor((v) => ({ ...v, lng: loc.lng, lat: loc.lat, address_text: label || v.address_text }));
    loadNearbyRequests({ lng: loc.lng, lat: loc.lat });
  }

  function handleAddressFound({ lat, lng, label }) {
    handlePickLocation({ lat, lng }, label);
  }

  function handleOffered(requestId, offerId) {
    setRespondedIds((prev) => new Set(prev).add(requestId));
    if (offerId) setOfferIdsByRequest((prev) => ({ ...prev, [requestId]: offerId }));
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
        <InstallPrompt appName="Tsvaga Vendor" iconSrc="/icons/vendor-icon-192.png" dismissKey="vendor" />
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Vendor dashboard — manage stock and respond to nearby requests.</p>
        </header>
        <VendorAuth onAuthed={loadProfile} />
      </div>
    );
  }

  const vendorLocation = vendor.lat && vendor.lng ? { lat: vendor.lat, lng: vendor.lng } : null;
  // Collapsed by default once a location is already set (saves space) - open
  // by default for a brand-new vendor who still needs to drop their first
  // pin. Either way, the vendor can freely toggle it themselves afterward.
  const mapOpen = mapOpenOverride !== null ? mapOpenOverride : !vendorLocation;

  return (
   <div className="app-shell">
      <InstallPrompt appName="Tsvaga Vendor" iconSrc="/icons/vendor-icon-192.png" dismissKey="vendor" />
      <header className="vendor-header">
        <div className="vendor-name-block">
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{ fontSize: '1.4rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #d8cdb9' }}
                autoFocus
              />
              <button onClick={saveShopName}>Save</button>
              <button className="secondary" onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          ) : (
            <h1>
              {vendor.business_name}{' '}
              <button className="link-btn" onClick={startEditingName} style={{ fontSize: '0.9rem' }}>
                ✎ Edit name
              </button>
            </h1>
          )}
          <p className="tagline">{vendor.address_text || 'Set your store location on the map below'}</p>
          <OnlineCount socket={socket} />
        </div>
        <div className="header-actions">
          <button className={vendor.is_online ? 'status-btn online' : 'status-btn offline'} onClick={toggleOnline}>
            {vendor.is_online ? '● Online — accepting requests' : '○ Offline'}
          </button>
          {vendor.role === 'both' && (
            <a href="/">
              <button className="secondary">Customer site</button>
            </a>
          )}
          {pushStatus !== 'granted' && (
            <span className="notify-glow">
              <button className="notify-btn" onClick={handleEnablePush}>
                Enable notifications
              </button>
            </span>
          )}
        </div>
      </header>

      <VendorTodoList orders={orders} />

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

      <section style={{ marginBottom: 20 }}>
        <PriorityPanel subscriptionInfo={subscriptionInfo} />
      </section>

      <section style={{ marginBottom: 20 }}>
        <VendorCategoryPreferences />
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

      <main className="vendor-main">
        <div className="vendor-left-stack">
          <section className="map-section">
            <div className="category-accordion">
              <button
                type="button"
                className="category-accordion-toggle"
                onClick={() => setMapOpenOverride(!mapOpen)}
              >
                <span>📍 {vendorLocation ? vendor.address_text || 'Store location set' : 'Set your store location'}</span>
                <span>{mapOpen ? '▲ hide map' : '▼ adjust pin'}</span>
              </button>
              {mapOpen && (
                <div className="category-accordion-body">
                  <MapView
                    requesterLocation={vendorLocation}
                    onPickLocation={handlePickLocation}
                    radiusKm={0}
                    onAddressFound={handleAddressFound}
                  />
                  <p className="hint">Tap the map to set or update your store's pin.</p>
                </div>
              )}
            </div>
          </section>

          <section id="section-orders" className="panel vendor-orders-section">
            <h2 style={{ marginTop: 0 }}>Orders to fulfill</h2>
            <VendorOrders orders={orders} onUpdated={handleOrderUpdated} socket={socket} currentUserId={vendor.id} />
          </section>

          <section id="section-inventory" className="panel vendor-inventory-section">
            <InventoryManager
              inventory={vendor.inventory || []}
              onChange={(inv) => setVendor((v) => ({ ...v, inventory: inv }))}
            />
          </section>

          <section className="panel vendor-reviews-section">
            <div className="category-accordion">
              <button type="button" className="category-accordion-toggle" onClick={() => setReviewsOpen((o) => !o)}>
                <span>⭐ Reviews {vendor.rating_avg ? `(${vendor.rating_avg} avg)` : ''}</span>
                <span>{reviewsOpen ? '▲' : '▼ show'}</span>
              </button>
              {reviewsOpen && (
                <div className="category-accordion-body">
                  <VendorReviews reviews={reviews} ratingAvg={vendor.rating_avg} />
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="panel vendor-requests-section">
          <div className="alert-main">
            <h2 style={{ margin: 0 }}>Nearby requests</h2>
            <button className="secondary" onClick={() => loadNearbyRequests(vendor)}>
              Refresh
            </button>
          </div>
          <IncomingRequests
            alerts={alerts}
            respondedIds={respondedIds}
            offerIdsByRequest={offerIdsByRequest}
            onResponded={handleOffered}
            onPaywalled={handlePaywalled}
            socket={socket}
            currentUserId={vendor.id}
          />
        </section>
      </main>

      <section style={{ marginTop: 20, textAlign: 'center' }}>
        <AdvertisingSection />
      </section>
      <AdSlot />

      <footer style={{ marginTop: 24, textAlign: 'center', paddingTop: 14, borderTop: '1px solid #e7ddc9' }}>
        <button className="secondary" onClick={handleLogout}>Sign out</button>
        <DeleteAccountLink onDeleted={handleLogout} />
      </footer>
    </div>
  );
}
