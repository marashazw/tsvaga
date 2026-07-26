import React from 'react';
import ChatToggleButton from './ChatToggleButton.jsx';

export default function OfferList({ offers, onAccept, matched, socket, currentUserId }) {
  if (!offers.length) {
    return <p className="hint">Waiting for nearby stores to respond…</p>;
  }

  const withTotals = offers.map((o) => ({ ...o, total: Number(o.price) + Number(o.delivery_fee || 0) }));
  const sorted = [...withTotals].sort((a, b) => {
    const priorityDiff = (b.vendor_priority || 0) - (a.vendor_priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
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
            <span className="eta">{offer.delivery_eta_minutes} min</span>
          </div>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            Item: ${Number(offer.price).toFixed(2)}
            {Number(offer.delivery_fee || 0) > 0 && ` + Delivery: $${Number(offer.delivery_fee).toFixed(2)}`}
          </p>
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
