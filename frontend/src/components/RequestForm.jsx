import React, { useEffect, useState } from 'react';
import { CATEGORIES, suggestCategories } from '../categories.js';

export default function RequestForm({ location, addressLabel, radiusKm, onRadiusChange, onSubmit, submitting, requestType, onSwitchMode, initialProductText }) {
  const [productText, setProductText] = useState(initialProductText || '');
  const [quantity, setQuantity] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('+263 ');
  const [isRemote, setIsRemote] = useState(false);
  const [dropoffAddress, setDropoffAddress] = useState('');

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categoriesTouched, setCategoriesTouched] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deliveryAddressOpen, setDeliveryAddressOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const isService = requestType === 'service';
  const categoriesForType = CATEGORIES.filter((c) => c.type === requestType);
  const showsTransportDropoff = isService && selectedCategories.includes('transport_logistics');

  // Auto-suggest as they type, but only until the requester manually adjusts
  // the selection themselves - once touched, typing more shouldn't silently
  // override a choice they already made.
  useEffect(() => {
    if (categoriesTouched) return;
    setSelectedCategories(suggestCategories(productText, requestType));
  }, [productText, categoriesTouched, requestType]);

  function toggleCategory(slug) {
    setCategoriesTouched(true);
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!isRemote && !location) return;
    onSubmit({
      product_text: productText,
      quantity,
      fulfillment_type: fulfillmentType,
      delivery_address_text: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
      recipient_name: recipientName || undefined,
      recipient_phone: recipientPhone.trim() && recipientPhone.trim() !== '+263' ? recipientPhone.trim() : undefined,
      categories: selectedCategories.length ? selectedCategories : ['miscellaneous'],
      request_type: requestType,
      is_remote: isRemote,
      dropoff_address_text: showsTransportDropoff ? dropoffAddress : undefined,
    });
  }

  const summaryLabels = selectedCategories.length
    ? selectedCategories.map((slug) => CATEGORIES.find((c) => c.slug === slug)?.label || slug).join(', ')
    : 'Miscellaneous / General (default)';

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      {onSwitchMode && (
        <button
          type="button"
          className="link-btn"
          style={{ marginBottom: 10 }}
          onClick={() => onSwitchMode(isService ? 'product' : 'service')}
        >
          🔁 Switch to {isService ? 'a product' : 'a service'} request instead
        </button>
      )}
      <label>
        <span className="primary-label">{isService ? 'What service do you need?' : 'What are you looking for today?'}</span>
        <input
          type="text"
          placeholder={isService ? 'e.g. Plumber for a leaking pipe' : 'e.g. Mealie meal (10kg)'}
          value={productText}
          onChange={(e) => setProductText(e.target.value)}
          required
        />
      </label>

      <label>
        {isService ? 'Additional details (optional) — timeline, budget, specifics' : 'Quantity — how many, or how much of it'}
        <input
          type="text"
          placeholder={isService ? 'e.g. Needed by Friday, budget around $30' : 'e.g. 2 bags'}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>

      <div className="category-accordion">
        <button
          type="button"
          className="category-accordion-toggle"
          onClick={() => setCategoriesOpen((o) => !o)}
        >
          <span>Category: {summaryLabels}</span>
          <span>{categoriesOpen ? '▲' : '▼ edit'}</span>
        </button>
        {categoriesOpen && (
          <div className="category-accordion-body">
            <p className="hint" style={{ marginTop: 0 }}>
              We guessed based on what you typed — tick or untick any that fit. Leave everything unticked to be
              seen as a general request.
            </p>
            {categoriesForType.map((c) => (
              <label key={c.slug} className="category-checkbox">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(c.slug)}
                  onChange={() => toggleCategory(c.slug)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {isService && (
        <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={isRemote} onChange={(e) => setIsRemote(e.target.checked)} />
          This can be done remotely (no need for the provider to be nearby)
        </label>
      )}

      {showsTransportDropoff && (
        <label>
          Drop-off address (where should it be taken to?)
          <input
            type="text"
            placeholder="e.g. 45 Fife Avenue, Harare"
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
          />
        </label>
      )}

      {!isRemote && (
        <label>
          Search radius: {radiusKm} km
          <input
            type="range"
            min="1"
            max="60"
            value={radiusKm}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
          />
        </label>
      )}

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
          {isService ? 'Provider comes to me' : 'Deliver it to me'}
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name="fulfillment_type"
            value="pickup"
            checked={fulfillmentType === 'pickup'}
            onChange={() => setFulfillmentType('pickup')}
          />
          {isService ? "I'll go to them" : "I'll collect it myself"}
        </label>
      </fieldset>

      {fulfillmentType === 'delivery' && (
        <div className="category-accordion">
          <button
            type="button"
            className="category-accordion-toggle"
            onClick={() => setDeliveryAddressOpen((o) => !o)}
          >
            <span>{isService ? 'Delivery/service address (if different from your map pin)' : 'Delivery address / landmark (if different from your map pin)'}</span>
          </button>
          {deliveryAddressOpen && (
            <div className="category-accordion-body">
              <input
                type="text"
                placeholder="e.g. 12 Second Street, near the blue gate"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <span className="hint" style={{ display: 'block', marginTop: 4 }}>
                Leave blank to use the pin you dropped on the map.
              </span>
            </div>
          )}
        </div>
      )}

      {fulfillmentType === 'delivery' && (
        <div className="category-accordion">
          <button type="button" className="category-accordion-toggle" onClick={() => setContactOpen((o) => !o)}>
            <span>{isService ? 'Contact for service (optional)' : 'Contact for delivery (optional)'}</span>
          </button>
          {contactOpen && (
            <div className="category-accordion-body">
              <label>
                Recipient name (if not you)
                <input
                  type="text"
                  placeholder="e.g. Tendai (if collecting/receiving on your behalf)"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </label>
              <label>
                Contact phone (if different from your account)
                <input
                  type="text"
                  placeholder="+263 7..."
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                />
              </label>
              <span className="hint" style={{ display: 'block' }}>
                Leave blank and the vendor will use your account phone number.
              </span>
            </div>
          )}
        </div>
      )}

      <p className="hint">
        {isRemote
          ? 'Remote service — no physical location needed, matched nationwide.'
          : location
            ? addressLabel
              ? `Location set: ${addressLabel}`
              : 'Location set — tap the map again to move it.'
            : 'Tap the map to drop your location pin first.'}
      </p>

      <button type="submit" disabled={(!isRemote && !location) || submitting}>
        {submitting ? 'Alerting nearby providers…' : isService ? 'Ask nearby providers' : 'Ask nearby stores'}
      </button>
    </form>
  );
}
