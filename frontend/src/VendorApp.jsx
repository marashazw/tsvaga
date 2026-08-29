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
import NotificationPrimer from './components/NotificationPrimer.jsx';
import { api, loadStoredToken, setAuthToken } from './api';
import { enablePushNotifications, checkExistingPushStatus, getLastPushErrorMessage } from './push';
import InstallPrompt from './components/InstallPrompt.jsx';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function VendorApp() {
  const [authed, setAuthed] = useState(false), [vendor, setVendor] = useState(null), [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [alerts, setAlerts] = useState([]), [respondedIds, setRespondedIds] = useState(new Set()), [offerIdsByRequest, setOfferIdsByRequest] = useState({});
  const [orders, setOrders] = useState([]), [reviews, setReviews] = useState([]), [paywallNotice, setPaywallNotice] = useState(null);
  const [pushStatus, setPushStatus] = useState(null), [pushErrorMessage, setPushErrorMessage] = useState(null);
  const [showNotificationPrimer, setShowNotificationPrimer] = useState(false), [primingConfirming, setPrimingConfirming] = useState(false);
  const [socket, setSocket] = useState(null), [loading, setLoading] = useState(true), [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(''), [mapOpenOverride, setMapOpenOverride] = useState(null), [reviewsOpen, setReviewsOpen] = useState(false);

  const isInstalled = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone);

  const loadSubscription = useCallback(async () => {
    const { data } = await api.get('/vendors/me/subscription'); setSubscriptionInfo(data);
  }, []);

  const loadNearbyRequests = useCallback(async (vendorData) => {
    if (typeof vendorData.lng !== 'number' || typeof vendorData.lat !== 'number') return;
    try {
      const { data } = await api.get('/requests/nearby/list', { params: { lng: vendorData.lng, lat: vendorData.lat, radius_km: 10 } });
      const normalized = data.map((r) => ({
        request_id: r.id, product_text: r.product_text, quantity: r.quantity, address_text: r.address_text,
        fulfillment_type: r.fulfillment_type, delivery_address_text: r.delivery_address_text, recipient_name: r.recipient_name,
        recipient_phone: r.recipient_phone, distance_m: r.distance_m, expires_at: r.expires_at, created_at: r.created_at, subscription_required: r.subscription_required,
      }));
      setAlerts(normalized);
    } catch (err) { console.error('Failed to load nearby requests', err); }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/vendors/me'); setVendor(data); setAuthed(true);
      const { data: myOrders } = await api.get('/vendors/me/orders'); setOrders(myOrders);
      const { data: myReviews } = await api.get(`/vendors/${data.id}/reviews`); setReviews(myReviews);
      await loadSubscription(); await loadNearbyRequests(data);
    } catch { setAuthed(false); } finally { setLoading(false); }
  }, [loadSubscription, loadNearbyRequests]);

  useEffect(() => {
    const token = loadStoredToken();
    if (token) loadProfile(); else setLoading(false);
  }, [loadProfile]);

  useEffect(() => { checkExistingPushStatus().then((s) => s && setPushStatus(s)); }, []);

  useEffect(() => {
    if (!vendor) return;
    const s = io(SOCKET_BASE, { auth: { token: localStorage.getItem('tsvaga_token') } });
    s.on('connect', () => s.emit('vendor:subscribe', vendor.id));
    s.on('request:new', (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 100)));
    s.on('order:new', (o) => setOrders((prev) => (prev.some((x) => x.id === o.id) ? prev : [o, ...prev])));
    s.on('order:status', (p) => setOrders((prev) => prev.map((o) => (o.id === p.order_id ? { ...o, status: p.status } : o))));
    s.on('review:new', (p) => setReviews((prev) => [{ id: `${p.order_id}-temp`, rating: p.rating, comment: p.comment, created_at: new Date().toISOString() }, ...prev]));
    setSocket(s); return () => s.disconnect();
  }, [vendor?.id]);

  useEffect(() => {
    if (!socket || !vendor) return;
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      loadNearbyRequests(vendor);
    };
    document.addEventListener('visibilitychange', handleVisible); window.addEventListener('focus', handleVisible);
    return () => { document.removeEventListener('visibilitychange', handleV); window.removeEventListener('focus', handleV); };
  }, [socket, vendor, loadNearbyRequests]);

  const startEditingName = () => { setNameInput(vendor.business_name); setEditingName(true); };
  const saveShopName = async () => {
    if (!nameInput.trim()) return;
    try {
      const { data } = await api.patch('/vendors/me/profile', { business_name: nameInput.trim() });
      setVendor((v) => ({ ...v, business_name: data.business_name })); setEditingName(false);
    } catch (err) { alert(err.response?.data?.error || 'Failed to update shop name'); }
  };

  const toggleOnline = async () => {
    const { data } = await api.patch('/vendors/me/status', { is_online: !vendor.is_online });
    setVendor((v) => ({ ...v, is_online: data.is_online }));
  };

  const handlePickLocation = async (loc, addressLabel) => {
    let label = addressLabel;
    if (!label) {
      try {
        const { data } = await api.get('/geocode/reverse', { params: { lat: loc.lat, lng: loc.lng } });
        label = data.display_name;
      } catch { label = undefined; }
    }
    await api.post('/vendors/me/location', { lng: loc.lng, lat: loc.lat, address_text: label || undefined });
    setVendor((v) => ({ ...v, lng: loc.lng, lat: loc.lat, address_text: label || v.address_text }));
    loadNearbyRequests({ lng: loc.lng, lat: loc.lat });
  };

  const handleAddressFound = ({ lat, lng, label }) => handlePickLocation({ lat, lng }, label);
  const handleOffered = (reqId, offId) => { setRespondedIds((p) => new Set(p).add(reqId)); if (offId) setOfferIdsByRequest((p) => ({ ...p, [reqId]: offId })); };
  const handlePaywalled = (data) => { setPaywallNotice(data); loadSubscription(); };
  const handleOrderUpdated = (u) => setOrders((p) => p.map((o) => (o.id === u.id ? { ...o, ...u } : o)));

  const handleEnablePush = async () => {
    setPrimingConfirming(true);
    try {
      const res = await enablePushNotifications(); setPushStatus(res);
      setPushErrorMessage(res === 'error' ? getLastPushErrorMessage() : null);
    } catch (err) { setPushStatus('error'); setPushErrorMessage(err?.message || String(err)); } finally { setPrimingConfirming(false); setShowNotificationPrimer(false); }
  };

  const handleLogout = () => { setAuthToken(null); setAuthed(false); setVendor(null); socket?.disconnect(); };

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
  const mapOpen = mapOpenOverride !== null ? mapOpenOverride : !vendorLocation;

  return (
    <div className="app-shell">
      <InstallPrompt appName="Tsvaga Vendor" iconSrc="/icons/vendor-icon-192.png" dismissKey="vendor" />
      <header className="vendor-header">
        <div className="vendor-name-block">
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} style={{ fontSize: '1.4rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #d8cdb9' }} autoFocus />
              <button onClick={saveShopName}>Save</button>
              <button className="secondary" onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          ) : (
            <h1>{vendor.business_name} <button className="link-btn" onClick={startEditingName} style={{ fontSize: '0.9rem' }}>✎ Edit name</button></h1>
          )}
          <p className="tagline">{vendor.address_text || 'Set your store location on the map below'}</p>
          <OnlineCount socket={socket} />
        </div>
        <div className="header-actions">
          <button className={vendor.is_online ? 'status-btn online' : 'status-btn offline'} onClick={toggleOnline}>{vendor.is_online ? '● Online' : '○ Offline'}</button>
          {vendor.role === 'both' && <a href="/"><button className="secondary">Customer site</button></a>}
          {pushStatus !== 'granted' && (
            <span className="notify-glow"><button className="notify-btn" onClick={() => setShowNotificationPrimer(true)}>Enable notifications</button></span>
          )}
        </div>
      </header>

      <VendorTodoList orders={orders} />

      {showNotificationPrimer && (
        <NotificationPrimer
          message="Get notified the instant a new request comes in nearby — even when the app is closed."
          onConfirm={handleEnablePush} onDismiss={() => setShowNotificationPrimer(false)} confirming={primingConfirming}
        />
      )}

      {pushStatus === 'granted' && (
        <p className="hint">Push notifications on — you'll be alerted even if this {isInstalled ? 'app' : 'tab'} is closed.</p>
      )}
      {pushStatus === 'denied' && (
        <p className="hint">
          {isInstalled 
            ? "Notifications were blocked — please enable them in your device's Android App Settings to receive alerts."
            : "Notifications were blocked in your browser — enable them in browser settings to use this."
          }
        </p>
      )}
      {pushStatus === 'error' && (
        <p className="hint" style={{ color: '#a03c3c' }}>Something went wrong enabling notifications{pushErrorMessage ? `: ${pushErrorMessage}` : ''}.</p>
      )}
      {pushStatus === 'not-configured' && <p className="hint">Push isn't configured on this server yet (missing VAPID keys).</p>}

      <section style={{ marginBottom: 20 }}><SubscriptionPanel subscriptionInfo={subscriptionInfo} onSubmitted={loadSubscription} /></section>
      <section style={{ marginBottom: 20 }}><PriorityPanel subscriptionInfo={subscriptionInfo} /></section>
      <section style={{ marginBottom: 20 }}><VendorCategoryPreferences /></section>

      {paywallNotice && (
        <div className="panel subscription-panel unpaid" style={{ marginBottom: 20 }}>
          <strong>That request needs an active subscription to respond to.</strong>
          <p className="hint">Send ${Number(paywallNotice.price).toFixed(2)} {paywallNotice.currency} via EcoCash to {paywallNotice.ecocash_number}.</p>
        </div>
      )}

      <main className="vendor-main">
        <div className="vendor-left-stack">
          <section className="map-section">
            <div className="category-accordion">
              <button type="button" className="category-accordion-toggle" onClick={() => setMapOpenOverride(!mapOpen)}>
                <span>📍 {vendorLocation ? vendor.address_text || 'Store location set' : 'Set your store location'}</span>
                <span>{mapOpen ? '▲' : '▼'}</span>
              </button>
              {mapOpen && (
                <div className="category-accordion-body">
                  <MapView requesterLocation={vendorLocation} onPickLocation={handlePickLocation} radiusKm={0} onAddressFound={handleAddressFound} />
                </div>
              )}
            </div>
          </section>
          <section id="section-orders" className="panel vendor-orders-section">
            <h2 style={{ marginTop: 0 }}>Orders to fulfill</h2>
            <VendorOrders orders={orders} onUpdated={handleOrderUpdated} socket={socket} currentUserId={vendor.id} />
          </section>
          <section id="section-inventory" className="panel vendor-inventory-section">
            <InventoryManager inventory={vendor.inventory || []} onChange={(inv) => setVendor((v) => ({ ...v, inventory: inv }))} />
          </section>
          <section className="panel vendor-reviews-section">
            <div className="category-accordion">
              <button type="button" className="category-accordion-toggle" onClick={() => setReviewsOpen((o) => !o)}>
                <span>⭐ Reviews {vendor.rating_avg ? `(${vendor.rating_avg} avg)` : ''}</span>
                <span>{reviewsOpen ? '▲' : '▼'}</span>
              </button>
              {reviewsOpen && <div className="category-accordion-body"><VendorReviews reviews={reviews} ratingAvg={vendor.rating_avg} /></div>}
            </div>
          </section>
        </div>

        <section className="panel vendor-requests-section">
          <div className="alert-main">
            <h2 style={{ margin: 0 }}>Nearby requests</h2>
            <button className="secondary" onClick={() => loadNearbyRequests(vendor)}>Refresh</button>
          </div>
          <IncomingRequests alerts={alerts} respondedIds={respondedIds} offerIdsByRequest={offerIdsByRequest} onResponded={handleOffered} onPaywalled={handlePaywalled} socket={socket} currentUserId={vendor.id} />
        </section>
      </main>

      <section style={{ marginTop: 20, textAlign: 'center' }}><AdvertisingSection /></section>
      <AdSlot />
      <footer style={{ marginTop: 24, textAlign: 'center', paddingTop: 14, borderTop: '1px solid #e7ddc9' }}>
        <button className="secondary" onClick={handleLogout}>Sign out</button>
        <DeleteAccountLink onDeleted={handleLogout} />
      </footer>
    </div>
  );
}
