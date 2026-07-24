import React from 'react';

export default function OfferList({ offers, onAccept, matched }) {
  if (!offers.length) {
    return <p className="hint">Waiting for nearby stores to respond…</p>;
  }

  const sorted = [...offers].sort((a, b) => a.price - b.price);

  return (
    <ul className="offer-list">
      {sorted.map((offer) => (
        <li key={offer.id} className={`offer-card ${offer.status}`}>
          <div className="offer-main">
            <strong>{offer.business_name}</strong>
            <span className="rating">★ {offer.rating_avg}</span>
          </div>
          <div className="offer-meta">
            <span className="price">${Number(offer.price).toFixed(2)}</span>
            <span className="eta">{offer.delivery_eta_minutes} min delivery</span>
          </div>
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
