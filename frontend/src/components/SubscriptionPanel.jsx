import React from 'react';
import { HELP_CENTER_URL } from '../helpCenter.js';

// No payment form lives here anymore - see helpCenter.js for why. This
// component only ever shows STATUS (paid up or not) and links out to the
// separate Help Center site to actually pay/manage the subscription.
export default function SubscriptionPanel({ subscriptionInfo }) {
  if (!subscriptionInfo) return null;
  const { subscription, price, currency } = subscriptionInfo;
  const isPaidUp = subscription.status === 'waived' ||
    (subscription.status === 'active' && subscription.expires_at && new Date(subscription.expires_at) > new Date());

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
        <p className="hint" style={{ margin: '8px 0 0' }}>
          <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer">Manage your subscription</a>
        </p>
      </div>
    );
  }

  return (
    <div className="panel subscription-panel unpaid">
      <h3 style={{ marginTop: 0 }}>Subscribe to respond to requests</h3>
      <p className="hint">
        A subscription costs <strong>${Number(price).toFixed(2)} {currency}/month</strong>.
      </p>
      <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer">
        <button type="button">Manage subscription on our website</button>
      </a>
    </div>
  );
}
