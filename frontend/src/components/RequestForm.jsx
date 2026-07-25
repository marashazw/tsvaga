import React, { useState } from 'react';

export default function RequestForm({ location, radiusKm, onRadiusChange, onSubmit, submitting }) {
  const [productText, setProductText] = useState('');
  const [quantity, setQuantity] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!location) return;
    onSubmit({
      product_text: productText,
      quantity,
      fulfillment_type: fulfillmentType,
      delivery_address_text: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
    });
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

      <fieldset className="fulfillment-choice">
        <legend>How do you want to get it?</legend>
        <label className="radio-label">
          <input
            type="radio"
            name="fulfillment_type"
            value="delivery"
            checked={fulfillmentType === 'delivery'}
            onChange={() => setFulfillmentType('delivery')}
          />
          Deliver it to me
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name="fulfillment_type"
            value="pickup"
            checked={fulfillmentType === 'pickup'}
            onChange={() => setFulfillmentType('pickup')}
          />
          I'll collect it myself
        </label>
      </fieldset>

      {fulfillmentType === 'delivery' && (
        <label>
          Delivery address / landmark (if different from your map pin)
          <input
            type="text"
            placeholder="e.g. 12 Second Street, near the blue gate"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
          />
          <span className="hint" style={{ display: 'block', marginTop: 4 }}>
            Leave blank to deliver to the pin you dropped on the map.
          </span>
        </label>
      )}

      <p className="hint">
        {location ? 'Location set — tap the map again to move it.' : 'Tap the map to drop your location pin first.'}
      </p>

      <button type="submit" disabled={!location || submitting}>
        {submitting ? 'Alerting nearby stores…' : 'Ask nearby stores'}
      </button>
    </form>
  );
}
