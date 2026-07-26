import React, { useState } from 'react';

export default function RequestForm({ location, radiusKm, onRadiusChange, onSubmit, submitting }) {
  const [productText, setProductText] = useState('');
  const [quantity, setQuantity] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!location) return;
    onSubmit({ product_text: productText, quantity });
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      <label>
        What do you want?
        <input
          type="text"
          placeholder="e.g. Mealie meal (10kg)"
          value={productText}
          onChange={(e) => setProductText(e.target.value)}
          required
        />
      </label>

      <label>
        How much?
        <input
          type="text"
          placeholder="e.g. 2 bags"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>

      <label>
        Search radius: {radiusKm} km
        <input
          type="range"
          min="1"
          max="25"
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
        />
      </label>

      <p className="hint">
        {location ? 'Location set — tap the map again to move it.' : 'Tap the map to drop your location pin first.'}
      </p>

      <button type="submit" disabled={!location || submitting}>
        {submitting ? 'Alerting nearby stores…' : 'Ask nearby stores'}
      </button>
    </form>
  );
}
