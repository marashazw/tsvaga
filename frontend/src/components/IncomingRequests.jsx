import React, { useState } from 'react';
import { api } from '../api';

function RespondForm({ alert, onSent, onPaywalled }) {
  const [price, setPrice] = useState('');
  const [eta, setEta] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api.post(`/requests/${alert.request_id}/offers`, {
        price: Number(price),
        delivery_eta_minutes: Number(eta),
        message: message || undefined,
      });
      onSent(alert.request_id);
    } catch (err) {
      if (err.response?.status === 402) {
        onPaywalled(err.response.data);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="respond-form" onSubmit={submit}>
      <input type="number" step="0.01" placeholder="Your price ($)" value={price} onChange={(e) => setPrice(e.target.value)} required />
      <input type="number" placeholder="ETA (min)" value={eta} onChange={(e) => setEta(e.target.value)} required />
      <input type="text" placeholder="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send offer'}</button>
    </form>
  );
}

export default function IncomingRequests({ alerts, respondedIds, onResponded, onPaywalled }) {
  if (!alerts.length) {
    return <p className="hint">You're online — new nearby requests will show up here instantly.</p>;
  }

  return (
    <ul className="alert-list">
      {alerts.map((a) => (
        <li key={a.request_id} className="alert-card">
          {a.subscription_required ? (
            <>
              <div className="alert-main">
                <strong>🔒 A nearby request came in</strong>
                <span className="hint">{Math.round(a.distance_m / 100) / 10} km away</span>
              </div>
              <p className="hint">Subscribe to see what's wanted and respond with an offer.</p>
            </>
          ) : (
            <>
              <div className="alert-main">
                <strong>{a.product_text}</strong>
                <span className="hint">{Math.round(a.distance_m / 100) / 10} km away</span>
              </div>
              {a.quantity && <p className="hint">Qty: {a.quantity}</p>}
              {respondedIds.has(a.request_id) ? (
                <span className="badge accepted">Offer sent</span>
              ) : (
                <RespondForm alert={a} onSent={onResponded} onPaywalled={onPaywalled} />
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
