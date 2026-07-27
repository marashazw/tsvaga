import React, { useState } from 'react';
import { api } from '../api';

export default function SubscriptionPanel({ subscriptionInfo, onSubmitted }) {
  const [amount, setAmount] = useState(subscriptionInfo?.price || '');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!subscriptionInfo) return null;
  const { subscription, price, currency, ecocash_number } = subscriptionInfo;
  const isPaidUp = subscription.status === 'waived' ||
    (subscription.status === 'active' && subscription.expires_at && new Date(subscription.expires_at) > new Date());

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/vendors/me/payment-submissions', {
        amount: Number(amount),
        ecocash_reference: reference || undefined,
      });
      setSubmitted(true);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (isPaidUp) {
    const isTrial = subscription.status === 'active' && subscription.note && subscription.note.toLowerCase().includes('trial');
    const daysLeft = subscription.expires_at
      ? Math.max(0, Math.ceil((new Date(subscription.expires_at) - new Date()) / (24 * 60 * 60 * 1000)))
      : null;

    return (
      <div className={`panel subscription-panel ${isTrial ? 'trial' : 'paid'}`}>
        <strong>
          {subscription.status === 'waived'
            ? 'Subscription waived by admin — unlimited access'
            : isTrial
              ? `🎁 Free trial active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left (until ${new Date(subscription.expires_at).toLocaleDateString()})`
              : `Subscribed — active until ${new Date(subscription.expires_at).toLocaleDateString()}`}
        </strong>
        {isTrial && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            You'll be able to pay to continue once this trial ends — we'll remind you a few days before it expires.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="panel subscription-panel unpaid">
      <h3 style={{ marginTop: 0 }}>Subscribe to respond to requests</h3>
      <p className="hint">
        A subscription costs <strong>${Number(price).toFixed(2)} {currency}/month</strong>. Send payment via{' '}
        <strong>EcoCash to {ecocash_number}</strong>, then confirm below — an admin will activate your account
        once they've verified it.
      </p>

      {submitted ? (
        <p className="badge status-confirmed">Payment submitted — awaiting admin approval.</p>
      ) : (
        <form onSubmit={handleSubmit} className="inventory-form">
          <input
            type="number"
            step="0.01"
            placeholder="Amount paid ($)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="EcoCash reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : "I've paid — confirm"}
          </button>
        </form>
      )}
    </div>
  );
}
