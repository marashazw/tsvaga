import React, { useState } from 'react';
import { api } from '../api';
import ChatToggleButton from './ChatToggleButton.jsx';

function buildShareUrl(alert) {
  const lines = [
    `📦 Request via Tsvaga - Wanted: ${alert.product_text}`,
    alert.quantity ? `Qty: ${alert.quantity}` : null,
    alert.fulfillment_type === 'pickup'
      ? "Customer will collect — no delivery needed"
      : `Deliver to: ${alert.delivery_address_text || alert.address_text || "customer's pinned location"}`,
    '',
    'Want to help fulfil this? Join Tsvaga to contact the requester directly OR to post what you are looking for: https://tsvaga.app',
  ].filter((line) => line !== null).join('\n');
  return `https://wa.me/?text=${encodeURIComponent(lines)}`;
}

function RespondForm({ alert, onSent, onPaywalled }) {
  const [price, setPrice] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [eta, setEta] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const isPickup = alert.fulfillment_type === 'pickup';

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await api.post(`/requests/${alert.request_id}/offers`, {
        price: Number(price),
        delivery_fee: isPickup ? 0 : Number(deliveryFee || 0),
        delivery_eta_minutes: Number(eta),
        message: message || undefined,
      });
      onSent(alert.request_id, data.id);
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
      <input type="number" step="0.01" placeholder="Item price ($)" value={price} onChange={(e) => setPrice(e.target.value)} required />
      {!isPickup && (
        <input
          type="number"
          step="0.01"
          placeholder="Delivery fee ($)"
          value={deliveryFee}
          onChange={(e) => setDeliveryFee(e.target.value)}
        />
      )}
      <input type="number" placeholder="ETA (min)" value={eta} onChange={(e) => setEta(e.target.value)} required />
      <input type="text" placeholder="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send offer'}</button>
      <a
        href={buildShareUrl(alert)}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          marginLeft: 8,
          color: 'var(--clay)',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Share on WhatsApp
      </a>
    </form>
  );
}

function SentOfferChat({ offerId, socket, currentUserId }) {
  return (
    <>
      <span className="badge accepted">Offer sent</span>{' '}
      <ChatToggleButton offerId={offerId} socket={socket} currentUserId={currentUserId} label="Message customer" />
    </>
  );
}

export default function IncomingRequests({ alerts, respondedIds, offerIdsByRequest, onResponded, onPaywalled, socket, currentUserId }) {
  const [visibleCount, setVisibleCount] = useState(10);
  const [expanded, setExpanded] = useState(false);

  if (!alerts.length) {
    return <p className="hint">You're online — new nearby requests will show up here instantly.</p>;
  }

  const visible = alerts.slice(0, visibleCount);

  return (
    <>
      <ul className="alert-list">
        {visible.map((a) => (
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
                <p className="hint">
                  {a.fulfillment_type === 'pickup'
                    ? '🚶 Customer will collect'
                    : a.delivery_address_text
                      ? `🚚 Deliver to: ${a.delivery_address_text}`
                      : '🚚 Deliver to their pinned location'}
                </p>
                {(a.recipient_name || a.recipient_phone) && (
                  <p className="hint">
                    📞 {a.recipient_name || 'Contact'}{a.recipient_phone ? `: ${a.recipient_phone}` : ''}
                  </p>
                )}
                {respondedIds.has(a.request_id) ? (
                  <SentOfferChat
                    offerId={offerIdsByRequest[a.request_id]}
                    socket={socket}
                    currentUserId={currentUserId}
                  />
                ) : (
                  <RespondForm alert={a} onSent={onResponded} onPaywalled={onPaywalled} />
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {alerts.length > 10 && (
        <div className="category-accordion" style={{ marginTop: 10 }}>
          <button type="button" className="category-accordion-toggle" onClick={() => setExpanded((e) => !e)}>
            <span>Showing {Math.min(visibleCount, alerts.length)} of {alerts.length} requests</span>
            <span>{expanded ? '▲' : '▼ show more'}</span>
          </button>
          {expanded && (
            <div className="category-accordion-body">
              <div className="admin-actions">
                {[10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={visibleCount === n ? undefined : 'secondary'}
                    onClick={() => setVisibleCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
