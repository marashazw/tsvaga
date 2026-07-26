import React from 'react';

export default function VendorReviews({ reviews, ratingAvg }) {
  return (
    <div>
      <div className="alert-main" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Reviews</h2>
        {ratingAvg && <span className="star-display">★ {Number(ratingAvg).toFixed(1)}</span>}
      </div>
      {reviews.length === 0 ? (
        <p className="hint">No reviews yet — they'll show up here after customers rate a delivered order.</p>
      ) : (
        <ul className="order-list">
          {reviews.map((r) => (
            <li key={r.id} className="order-card">
              <span className="star-display">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              {r.comment && <p className="hint">"{r.comment}"</p>}
              <p className="hint" style={{ fontSize: '0.8rem' }}>{new Date(r.created_at).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
