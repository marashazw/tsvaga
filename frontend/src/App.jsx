import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import MapView from './components/MapView.jsx';
import RequestForm from './components/RequestForm.jsx';
import OfferList from './components/OfferList.jsx';
import OrderTracker from './components/OrderTracker.jsx';
import RequesterAuth from './components/RequesterAuth.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import AdSlot from './components/AdSlot.jsx';
import AdvertisingSection from './components/AdvertisingSection.jsx';
import MyRequests from './components/MyRequests.jsx';
import OnlineCount from './components/OnlineCount.jsx';
import DeleteAccountLink from './components/DeleteAccountLink.jsx';
import NotificationPrimer from './components/NotificationPrimer.jsx';
import { api, loadStoredToken, setAuthToken } from './api';
import { enablePushNotifications, checkExistingPushStatus, getLastPushErrorMessage } from './push';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || 'http://localhost:4000';

export default function App() {
  const [authed, setAuthed] = useState(false), [user, setUser] = useState(null), [checkingAuth, setCheckingAuth] = useState(true);
  const [location, setLocation] = useState({ lat: -17.8292, lng: 31.0522 }), [addressLabel, setAddressLabel] = useState(null), [radiusKm, setRadiusKm] = useState(35);
  const [request, setRequest] = useState(null), [offers, setOffers] = useState([]), [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null), [hasRequestHistory, setHasRequestHistory] = useState(false), [socket, setSocket] = useState(null);
  const [pushStatus, setPushStatus] = useState(null), [pushErrorMessage, setPushErrorMessage] = useState(null);
  const [showNotificationPrimer, setShowNotificationPrimer] = useState(false), [primingConfirming, setPrimingConfirming] = useState(false), [mapOpenOverride, setMapOpenOverride] = useState(null);

  const isInstalled = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone);

  const checkAuth = useCallback(async () => {
    const t = loadStoredToken();
    if (!t) { setCheckingAuth(false); return; }
    try { const { data } = await api.get('/auth/me'); setUser(data); setAuthed(true); } catch { setAuthToken(null); setAuthed(false); } finally { setCheckingAuth(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);
  useEffect(() => { checkExistingPushStatus().then((s) => s && setPushStatus(s)); }, []);
  useEffect(() => { if (!authed) return; const s = io(SOCKET_BASE, { auth: { token: localStorage.getItem('tsvaga_token') } }); setSocket(s); return () => s.disconnect(); }, [authed]);
  useEffect(() => { if (!authed) return; api.get('/requests/me').then(({ data }) => setHasRequestHistory(data.length > 0)).catch(() => {}); }, [authed]);

  useEffect(() => {
    if (!socket || !request) return;
    const sub = () => socket.emit('request:subscribe', request.id);
    sub(); socket.on('connect', sub);
    const onO = (o) => setOffers((prev) => [...prev.filter((x) => x.id !== o.id), o]);
    const onS = (p) => setOrder((prev) => (prev ? { ...prev, status: p.status } : prev));
    socket.on('offer:new', onO); socket.on('order:status', onS);
    return () => { socket.off('connect', sub); socket.off('offer:new', onO); socket.off('order:status', onS); };
  }, [socket, request]);

  useEffect(() => {
    if (!socket) return;
    const handleV = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      if (request) api.get(`/requests/${request.id}`).then(({ data }) => setOffers(data.offers || [])).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleV); window.addEventListener('focus', handleV);
    return () => { document.removeEventListener('visibilitychange', handleV); window.removeEventListener('focus', handleV); };
  }, [socket, request]);

  const handlePickLocation = useCallback((l) => {
    setLocation(l);
    api.get('/geocode/reverse', { params: { lat: l.lat, lng: l.lng } }).then(({ data }) => setAddressLabel(data.display_name)).catch(() => setAddressLabel(null));
  }, []);

  const handleAddressFound = ({ lat, lng, label }) => { setLocation({ lat, lng }); setAddressLabel(label); };
  const handleAuthed = (userData) => { setUser(userData); setAuthed(true); };

  const handleEnablePush = async () => {
    setPrimingConfirming(true);
    try {
      const res = await enablePushNotifications(); setPushStatus(res);
      setPushErrorMessage(res === 'error' ? getLastPushErrorMessage() : null);
    } catch (err) { setPushStatus('error'); setPushErrorMessage(err?.message || String(err)); } finally { setPrimingConfirming(false); setShowNotificationPrimer(false); }
  };

  const handleLogout = () => { setAuthToken(null); setAuthed(false); setUser(null); socket?.disconnect(); setRequest(null); setOffers([]); setOrder(null); };

  const handleSubmitRequest = async (fields) => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/requests', { ...fields, lng: location.lng, lat: location.lat, address_text: addressLabel || undefined, radius_km: radiusKm });
      setRequest(data.request); setOffers([]); setOrder(null);
    } catch (err) { alert(err.response?.data?.error || 'Failed to create request'); } finally { setSubmitting(false); }
  };

  const handleAcceptOffer = async (offerId) => {
    try {
      const { data } = await api.patch(`/offers/${offerId}/accept`);
      const { data: fullOrder } = await api.get(`/orders/${data.order.id}`); setOrder(fullOrder);
    } catch (err) { alert(err.response?.data?.error || 'Failed to accept offer'); }
  };

  const startOver = () => { setRequest(null); setOffers([]); setOrder(null); };

  if (checkingAuth) return <div className="app-shell">Loading…</div>;

  if (!authed) {
    return (
      <div className="app-shell">
        <InstallPrompt appName="Tsvaga" iconSrc="/icons/icon-192.png" dismissKey="main" />
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Ask for what you want. Nearby stores come to you.</p>
        </header>
        <RequesterAuth onAuthed={handleAuthed} />
      </div>
    );
  }

  const mapOpen = mapOpenOverride !== null ? mapOpenOverride : !(addressLabel || request);

  return (
    <div className="app-shell">
      <InstallPrompt appName="Tsvaga" iconSrc="/icons/icon-192.png" dismissKey="main" />
      <header className="vendor-header">
        <div className="vendor-name-block">
          <h1>Tsvaga</h1>
          <p className="tagline">Hi {user.name} — ask for what you want.</p>
          <OnlineCount socket={socket} />
        </div>
        <div className="header-actions">
          {(user.role === 'vendor' || user.role === 'both') && (
            <a href="/vendor.html"><button className="secondary">Vendor dashboard</button></a>
          )}
          {pushStatus !== 'granted' && (
            <span className="notify-glow">
              <button className="notify-btn" onClick={() => setShowNotificationPrimer(true)}>Enable notifications</button>
            </span>
          )}
        </div>
      </header>

      {showNotificationPrimer && (
        <NotificationPrimer
          message="Get notified the instant a nearby vendor responds to your request."
          onConfirm={handleEnablePush} onDismiss={() => setShowNotificationPrimer(false)} confirming={primingConfirming}
        />
      )}

      {pushStatus === 'granted' && (
        <p className="hint" style={{ textAlign: 'center' }}>
          Push notifications on — you'll be alerted even if this {isInstalled ? 'app' : 'tab'} is closed.
        </p>
      )}
      {pushStatus === 'denied' && (
        <p className="hint" style={{ textAlign: 'center' }}>
          {isInstalled 
            ? "Notifications were blocked — please enable them in your device's Android App Settings to receive alerts."
            : "Notifications were blocked in your browser — enable them in browser settings to use this."
          }
        </p>
      )}
      {pushStatus === 'error' && (
        <p className="hint" style={{ textAlign: 'center', color: '#a03c3c' }}>
          Something went wrong enabling notifications{pushErrorMessage ? `: ${pushErrorMessage}` : ''}.
        </p>
      )}

      <main>
        <div className="requester-left-stack">
          <section className="map-section">
            <div className="category-accordion">
              <button type="button" className="category-accordion-toggle" onClick={() => setMapOpenOverride(!mapOpen)}>
                <span>📍 {addressLabel || 'Set your location'}</span>
                <span>{mapOpen ? '▲ hide map' : '▼ adjust pin'}</span>
              </button>
              {mapOpen && (
                <div className="category-accordion-body">
                  <MapView requesterLocation={location} onPickLocation={handlePickLocation} radiusKm={radiusKm} onAddressFound={handleAddressFound} />
                </div>
              )}
            </div>
          </section>
          <div className="my-requests-area" id="my-requests-section"><MyRequests /></div>
        </div>

        <section className="panel request-form-section">
          {!request ? (
            <>
              {hasRequestHistory && (
                <a href="#my-requests-section" style={{ display: 'block', marginBottom: 10, color: 'var(--clay)', fontWeight: 600 }}>View my requests</a>
              )}
              <RequestForm location={location} addressLabel={addressLabel} radiusKm={radiusKm} onRadiusChange={setRadiusKm} onSubmit={handleSubmitRequest} submitting={submitting} />
            </>
          ) : order ? (
            <>
              <OrderTracker order={order} socket={socket} currentUserId={user.id} />
              {(order.status === 'delivered' || order.status === 'cancelled') && (
                <button className="secondary" onClick={startOver} style={{ marginTop: 12 }}>Start a new request</button>
              )}
            </>
          ) : (
            <div className="request-status">
              <h2>{request.product_text}</h2>
              <p className="hint">
                {request.fulfillment_type === 'pickup' ? "You'll collect this yourself." : request.delivery_address_text ? `Deliver to: ${request.delivery_address_text}` : 'Deliver to your pinned location.'}
              </p>
              <p className="hint">Live offers:</p>
              <OfferList offers={offers} onAccept={handleAcceptOffer} matched={false} socket={socket} currentUserId={user.id} />
              <button className="secondary" onClick={startOver}>Ask for another item</button>
            </div>
          )}
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
