import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';

export default function DriverTrack() {
  const orderId = new URLSearchParams(window.location.search).get('order');
  const [status, setStatus] = useState('idle'); // idle | sharing | stopped | error
  const [errorMessage, setErrorMessage] = useState('');
  const watchIdRef = useRef(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function startSharing() {
    if (!orderId) {
      setErrorMessage('This link is missing an order reference - ask for a fresh link.');
      setStatus('error');
      return;
    }
    if (!('geolocation' in navigator)) {
      setErrorMessage('This device/browser does not support location sharing.');
      setStatus('error');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('sharing');
        setErrorMessage('');
        const now = Date.now();
        if (now - lastSentAt.current < 8000) return; // throttle to ~once per 8s
        lastSentAt.current = now;
        api
          .patch(`/orders/${orderId}/location/public`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
          .catch((err) => {
            // Only surface an error if the order genuinely isn't trackable
            // anymore (e.g. already delivered) - a single dropped network
            // request isn't worth interrupting the driver over.
            if (err.response?.status === 409 || err.response?.status === 404) {
              setErrorMessage(err.response.data?.error || 'This delivery is no longer trackable.');
              setStatus('error');
              if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
            }
          });
      },
      (err) => {
        setErrorMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied - please allow location access to share your position.'
            : 'Could not get your location - check your device settings and try again.'
        );
        setStatus('error');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  function stopSharing() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setStatus('stopped');
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, textAlign: 'center', paddingTop: 60 }}>
      <h1 style={{ color: 'var(--forest)' }}>🛒 Tsvaga</h1>
      <p className="hint">Share your live location for this delivery</p>

      <div className="panel" style={{ marginTop: 20 }}>
        {status === 'idle' && (
          <>
            <p>
              Tap below to start sharing your location with the customer for this one delivery. This stops
              automatically once the order is marked delivered, or if you tap "Stop sharing".
            </p>
            <button type="button" onClick={startSharing} style={{ marginTop: 10 }}>
              📍 Start sharing my location
            </button>
          </>
        )}

        {status === 'sharing' && (
          <>
            <p className="badge status-delivered" style={{ display: 'inline-block' }}>
              🟢 Sharing your live location
            </p>
            <p className="hint" style={{ marginTop: 8 }}>
              You can close this tab once the delivery is complete - sharing stops automatically.
            </p>
            <button type="button" className="secondary" onClick={stopSharing} style={{ marginTop: 10 }}>
              Stop sharing
            </button>
          </>
        )}

        {status === 'stopped' && (
          <>
            <p className="hint">You've stopped sharing your location.</p>
            <button type="button" onClick={startSharing} style={{ marginTop: 10 }}>
              Resume sharing
            </button>
          </>
        )}

        {status === 'error' && <p className="error">{errorMessage}</p>}
      </div>
    </div>
  );
}
