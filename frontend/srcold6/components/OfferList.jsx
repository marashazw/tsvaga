import React from 'react';

export default function OfferList({ offers, onAccept, matched }) {
  if (!offers.length) {
    return <p className="hint">Waiting for nearby stores to respond…</p>;
  }

  const withTotals = offers.map((o) => ({ ...o, total: Number(o.price) + Number(o.delivery_fee || 0) }));
  const sorted = [...withTotals].sort((a, b) => a.total - b.total);

  return (
    <ul className="offer-list">
      {sorted.map((offer) => (
        <li key={offer.id} className={`offer-card ${offer.status}`}>
          <div className="offer-main">
            <strong>{offer.business_name}</strong>
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
