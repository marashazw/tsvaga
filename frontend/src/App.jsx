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
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Default the pin to Harare CBD so there's already a sensible starting point -
  // the user can still tap the map to move it anywhere else in Zimbabwe.
  const HARARE_CBD = { lat: -17.8292, lng: 31.0522 };
  const [location, setLocation] = useState(HARARE_CBD);
  const [addressLabel, setAddressLabel] = useState(null);
  const [radiusKm, setRadiusKm] = useState(35);
  const [request, setRequest] = useState(null);
  const [offers, setOffers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [hasRequestHistory, setHasRequestHistory] = useState(false);
  const [socket, setSocket] = useState(null);
  const [pushStatus, setPushStatus] = useState(null); // null | 'granted' | 'denied' | 'unsupported' | 'not-configured' | 'error'
  const [pushErrorMessage, setPushErrorMessage] = useState(null);
  const [showNotificationPrimer, setShowNotificationPrimer] = useState(false);
  const [primingConfirming, setPrimingConfirming] = useState(false);
  const [mapOpenOverride, setMapOpenOverride] = useState(null); // null = use the smart default below

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
    checkExistingPushStatus().then((status) => {
      if (status) setPushStatus(status);
    });
  }, []);

  useEffect(() => {
    if (!authed) return;
    const token = localStorage.getItem('tsvaga_token');
    const s = io(SOCKET_BASE, { auth: { token } });
    setSocket(s);
    return () => s.disconnect();
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    api
      .get('/requests/me')
      .then(({ data }) => setHasRequestHistory(data.length > 0))
      .catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (!socket || !request) return;
    // Re-subscribe on every (re)connect, not just once - if the socket drops
    // and reconnects (e.g. after the phone was backgrounded), the server
    // needs to be told again which request room this socket belongs to,
    // otherwise it silently stops receiving live offer/order updates for it.
    function subscribe() {
      socket.emit('request:subscribe', request.id);
    }
    subscribe();
    socket.on('connect', subscribe);

    const onOffer = (offer) => setOffers((prev) => [...prev.filter((o) => o.id !== offer.id), offer]);
    const onOrderStatus = (payload) => setOrder((prev) => (prev ? { ...prev, status: payload.status } : prev));

    socket.on('offer:new', onOffer);
    socket.on('order:status', onOrderStatus);
    return () => {
      socket.off('connect', subscribe);
      socket.off('offer:new', onOffer);
      socket.off('order:status', onOrderStatus);
    };
  }, [socket, request]);

  // Mobile OS's aggressively suspend WebSocket connections when the app is
  // backgrounded (screen locked, switched away from, etc.) to save battery,
  // and the client doesn't always notice the connection died. When the app
  // comes back to the foreground, force a reconnect if needed and refresh
  // the current request's offers/status as a safety net either way.
  useEffect(() => {
    if (!socket) return;
    function handleVisible() {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) {
        socket.connect();
      }
      if (request) {
        api
          .get(`/requests/${request.id}`)
          .then(({ data }) => {
            setOffers(data.offers || []);
          })
          .catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [socket, request]);

  const handlePickLocation = useCallback((loc) => {
    setLocation(loc);
    // Auto-fill the address label from the new pin position, rather than
    // leaving it blank until the person happens to type a search - this
    // covers dragging the marker, tapping the map, or using GPS locate.
    api
      .get('/geocode/reverse', { params: { lat: loc.lat, lng: loc.lng } })
      .then(({ data }) => setAddressLabel(data.display_name))
      .catch(() => setAddressLabel(null)); // fine to just fall back to no label if the lookup fails
  }, []);

  function handleAddressFound({ lat, lng, label }) {
    setLocation({ lat, lng });
    setAddressLabel(label);
  }

  function handleAuthed(userData) {
    setUser(userData);
    setAuthed(true);
  }

  async function handleEnablePush() {
    setPrimingConfirming(true);
    try {
      const result = await enablePushNotifications();
      setPushStatus(result);
      setPushErrorMessage(result === 'error' ? getLastPushErrorMessage() : null);
    } catch (err) {
      console.error('Unexpected error enabling push:', err);
      setPushStatus('error');
      setPushErrorMessage(err?.message || String(err));
    } finally {
      setPrimingConfirming(false);
      setShowNotificationPrimer(false);
    }
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

  async function handleSubmitRequest({
    product_text,
    quantity,
    fulfillment_type,
    delivery_address_text,
    recipient_name,
    recipient_phone,
    categories,
  }) {
    setSubmitting(true);
    try {
      const { data } = await api.post('/requests', {
        product_text,
        quantity,
        lng: location.lng,
        lat: location.lat,
        address_text: addressLabel || undefined,
        radius_km: radiusKm,
        fulfillment_type,
        delivery_address_text,
        recipient_name,
        recipient_phone,
        categories,
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
        <InstallPrompt appName="Tsvaga" iconSrc="/icons/icon-192.png" dismissKey="main" />
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Ask for what you want. Nearby stores come to you.</p>
        </header>
        <RequesterAuth onAuthed={handleAuthed} />
      </div>
    );
  }

  // Collapsed by default once a specific address has been confirmed (via
  // search) or a request is already active - saves space once the pin no
  // longer needs adjusting. Open by default for a fresh visit still sitting
  // on the default pin. Always freely toggleable afterward either way.
  const mapOpen = mapOpenOverride !== null ? mapOpenOverride : !(addressLabel || request);

  return (
   <div className="app-shell">
      <InstallPrompt appName="Tsvaga" iconSrc="/icons/icon-192.png" dismissKey="main" />
      <header className="vendor-header">
        <div className="vendor-name-block">
          <h1>Tsvaga</h1>
          <p className="tagline">Hi {user.name} — ask for what you want. Nearby stores come to you.</p>
          <OnlineCount socket={socket} />
        </div>
        <div className="header-actions">
          {(user.role === 'vendor' || user.role === 'both') && (
            <a href="/vendor.html">
              <button className="secondary">Vendor dashboard</button>
            </a>
          )}
          {pushStatus !== 'granted' && (
            <span className="notify-glow">
              <button className="notify-btn" onClick={() => setShowNotificationPrimer(true)}>
                Enable notifications
              </button>
            </span>
          )}
        </div>
      </header>

      {showNotificationPrimer && (
        <NotificationPrimer
          message="Get notified the instant a nearby vendor responds to your request — even when the app is closed."
          onConfirm={handleEnablePush}
          onDismiss={() => setShowNotificationPrimer(false)}
          confirming={primingConfirming}
        />
      )}

      {pushStatus === 'granted' && (
        <p className="hint" style={{ textAlign: 'center' }}>
          Push notifications on — you'll be alerted even if this tab is closed.
        </p>
      )}
      {pushStatus === 'denied' && (
        <p className="hint" style={{ textAlign: 'center' }}>
          Notifications were blocked in your browser — enable them in browser settings to use this.
        </p>
      )}
      {pushStatus === 'error' && (
        <p className="hint" style={{ textAlign: 'center', color: '#a03c3c' }}>
          Something went wrong enabling notifications{pushErrorMessage ? `: ${pushErrorMessage}` : ''} — please try
          again.
        </p>
      )}

      <main>
        <div className="requester-left-stack">
          <section className="map-section">
            <div className="category-accordion">
              <button
                type="button"
                className="category-accordion-toggle"
                onClick={() => setMapOpenOverride(!mapOpen)}
              >
                <span>📍 {addressLabel || 'Set your location'}</span>
                <span>{mapOpen ? '▲ hide map' : '▼ adjust pin'}</span>
              </button>
              {mapOpen && (
                <div className="category-accordion-body">
                  <MapView
                    requesterLocation={location}
                    onPickLocation={handlePickLocation}
                    radiusKm={radiusKm}
                    onAddressFound={handleAddressFound}
                  />
                </div>
              )}
            </div>
          </section>

          <div className="my-requests-area" id="my-requests-section">
            <MyRequests />
          </div>
        </div>

        <section className="panel request-form-section">
          {!request ? (
            <>
              {hasRequestHistory && (
                <a
                  href="#my-requests-section"
                  style={{ display: 'block', marginBottom: 10, color: 'var(--clay)', fontWeight: 600 }}
                >
                  View my requests
                </a>
              )}
              <RequestForm
                location={location}
                addressLabel={addressLabel}
                radiusKm={radiusKm}
                onRadiusChange={setRadiusKm}
                onSubmit={handleSubmitRequest}
                submitting={submitting}
              />
            </>
          ) : order ? (
            <>
              <OrderTracker order={order} socket={socket} currentUserId={user.id} />
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
              <OfferList offers={offers} onAccept={handleAcceptOffer} matched={false} socket={socket} currentUserId={user.id} />
              <button className="secondary" onClick={startOver}>
                Ask for another item
              </button>
            </div>
          )}
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
