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
    return (
      <div className="panel subscription-panel paid">
        <strong>
          {subscription.status === 'waived'
            ? 'Subscription waived by admin — unlimited access'
            : `Subscribed — active until ${new Date(subscription.expires_at).toLocaleDateString()}`}
        </strong>
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
