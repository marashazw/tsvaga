import React, { useState } from 'react';
import ReviewForm from './ReviewForm.jsx';
import ChatToggleButton from './ChatToggleButton.jsx';
import { exportOrderAsPdf } from '../pdfExport.js';

function formatEta(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  }
  return `${minutes} min`;
}

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
  const [exporting, setExporting] = useState(false);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportOrderAsPdf(order, currentUserId);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

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
        {formatEta(order.delivery_eta_minutes) && <> · {formatEta(order.delivery_eta_minutes)} ETA</>}
      </p>
      <p className="hint">
        {isPickup
          ? order.request_type === 'service'
            ? "You'll go to them."
            : "You'll collect this yourself."
          : order.delivery_address_text
            ? `${order.request_type === 'service' ? 'Service provided at' : 'Deliver to'}: ${order.delivery_address_text}`
            : order.request_type === 'service'
              ? 'Service provided at your pinned location.'
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {order.offer_id && (
          <ChatToggleButton
            offerId={order.offer_id}
            socket={socket}
            currentUserId={currentUserId}
            label={`Message ${order.business_name}`}
          />
        )}
        <button type="button" className="secondary" disabled={exporting} onClick={handleExportPdf}>
          {exporting ? 'Preparing PDF…' : '📄 Save as PDF'}
        </button>
      </div>

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
