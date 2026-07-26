import React, { useState } from 'react';
import ReviewForm from './ReviewForm.jsx';
import OfferChat from './OfferChat.jsx';

const STEPS_DELIVERY = [
  { key: 'confirmed', label: 'Order confirmed' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const STEPS_PICKUP = [
  { key: 'confirmed', label: 'Order confirmed' },
  { key: 'out_for_delivery', label: 'Ready for pickup' },
  { key: 'delivered', label: 'Picked up' },
];

export default function OrderTracker({ order, socket, currentUserId }) {
  const [review, setReview] = useState(
    order.review_id ? { rating: order.review_rating, comment: order.review_comment } : null
  );
  const [showChat, setShowChat] = useState(false);

  if (!order) return null;
  const isPickup = order.fulfillment_type === 'pickup';
  const steps = isPickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const currentIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';

  return (
    <div className="order-tracker">
      <h3 style={{ marginTop: 0 }}>{order.business_name}</h3>
      <p className="hint">
        {order.product_text} ·{' '}
        {Number(order.delivery_fee || 0) > 0
          ? `$${Number(order.price).toFixed(2)} + $${Number(order.delivery_fee).toFixed(2)} delivery = $${(Number(order.price) + Number(order.delivery_fee)).toFixed(2)}`
          : `$${Number(order.price).toFixed(2)}`}
        {' · '}{order.delivery_eta_minutes} min ETA
      </p>
      <p className="hint">
        {isPickup
          ? "You'll collect this yourself."
          : order.delivery_address_text
            ? `Deliver to: ${order.delivery_address_text}`
            : 'Deliver to your pinned location.'}
      </p>

      {isCancelled ? (
        <p className="badge status-cancelled">Order cancelled</p>
      ) : (
        <ol className="tracker-steps">
          {steps.map((step, i) => (
            <li key={step.key} className={i <= currentIndex ? 'done' : ''}>
              <span className="dot" />
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {order.offer_id && (
        <>
          <button className="link-btn" type="button" onClick={() => setShowChat((s) => !s)}>
            💬 {showChat ? 'Hide chat' : `Message ${order.business_name}`}
          </button>
          {showChat && <OfferChat offerId={order.offer_id} socket={socket} currentUserId={currentUserId} />}
        </>
      )}

      {isDelivered && (
        <div style={{ marginTop: 16 }}>
          {review ? (
            <div className="review-summary">
              <span className="star-display">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
              {review.comment && <p className="hint">"{review.comment}"</p>}
              <p className="hint">Thanks for the feedback!</p>
            </div>
          ) : (
            <ReviewForm orderId={order.id} onSubmitted={setReview} />
          )}
        </div>
      )}
    </div>
  );
}
