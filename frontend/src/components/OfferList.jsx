import React from 'react';

function formatEta(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  }
  return `${minutes} min`;
}
import ChatToggleButton from './ChatToggleButton.jsx';

export default function OfferList({ offers, onAccept, matched, socket, currentUserId }) {
  if (!offers.length) {
    return <p className="hint">Waiting for nearby stores to respond…</p>;
  }

  const withTotals = offers.map((o) => ({ ...o, total: Number(o.price) + Number(o.delivery_fee || 0) }));
  const sorted = [...withTotals].sort((a, b) => {
    const priorityDiff = (b.vendor_priority || 0) - (a.vendor_priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    const ratingDiff = (b.rating_avg || 0) - (a.rating_avg || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return a.total - b.total;
  });

  return (
    <ul className="offer-list">
      {sorted.map((offer) => (
        <li key={offer.id} className={`offer-card ${offer.status}`}>
          <div className="offer-main">
            <strong>
              {offer.business_name}
              {offer.vendor_priority > 0 && <span className="badge status-delivered" style={{ marginLeft: 6 }}>⭐ Featured</span>}
            </strong>
            <span className="rating">★ {offer.rating_avg}</span>
          </div>
          <div className="offer-meta">
            <span className="price">${offer.total.toFixed(2)}</span>
            {formatEta(offer.delivery_eta_minutes) && <span className="eta">{formatEta(offer.delivery_eta_minutes)}</span>}
          </div>
          {Array.isArray(offer.cart_prices) && offer.cart_prices.length > 0 ? (
            <div style={{ margin: '4px 0' }}>
              {offer.cart_prices.map((cp, i) => (
                <p key={i} className="hint" style={{ margin: '1px 0' }}>
                  {cp.product_text}: ${Number(cp.price).toFixed(2)}
                </p>
              ))}
              {Number(offer.delivery_fee || 0) > 0 && (
                <p className="hint" style={{ margin: '1px 0' }}>Delivery: ${Number(offer.delivery_fee).toFixed(2)}</p>
              )}
            </div>
          ) : (
            <p className="hint" style={{ margin: '2px 0 0' }}>
              Item: ${Number(offer.price).toFixed(2)}
              {Number(offer.delivery_fee || 0) > 0 && ` + Delivery: $${Number(offer.delivery_fee).toFixed(2)}`}
            </p>
          )}
          {offer.message && <p className="offer-message">{offer.message}</p>}
          <ChatToggleButton
            offerId={offer.id}
            socket={socket}
            currentUserId={currentUserId}
            label={`Message ${offer.business_name}`}
          />
          {!matched && offer.status === 'pending' && (
            <button onClick={() => onAccept(offer.id)}>Accept this offer</button>
          )}
          {offer.status === 'accepted' && <span className="badge accepted">Accepted</span>}
          {offer.status === 'declined' && <span className="badge declined">Declined</span>}
        </li>
      ))}
    </ul>
  );
}
