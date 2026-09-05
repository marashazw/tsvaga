import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { buildHelpCenterUrl } from '../helpCenter.js';

// Purchase form removed - see helpCenter.js for why. Status only here,
// link out to actually buy a boost.
export default function PriorityPanel({ subscriptionInfo, phone }) {
  const [info, setInfo] = useState(null);
  const helpCenterUrl = buildHelpCenterUrl(phone);

  useEffect(() => {
    api.get('/vendors/me/priority').then(({ data }) => setInfo(data));
  }, []);

  if (!info) return null;
  const { current } = info;
  const isBoosted =
    current.priority_score > 0 && current.priority_expires_at && new Date(current.priority_expires_at) > new Date();

  const sub = subscriptionInfo?.subscription;
  const hasActiveSubscription =
    sub && (sub.status === 'waived' || (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()));

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>⭐ Priority ranking</h3>
      {isBoosted ? (
        <p className="badge status-delivered">
          Boosted — your offers rank above non-boosted vendors until{' '}
          {new Date(current.priority_expires_at).toLocaleDateString()}
        </p>
      ) : (
        <p className="hint">
          Your offers currently rank by price alone. Buy a boost to appear above other vendors on the requester's
          offer list, regardless of price.
        </p>
      )}

      {!hasActiveSubscription ? (
        <p className="badge status-cancelled">
          You need an active subscription before you can buy a priority boost — subscribe first.
        </p>
      ) : (
        <a href={helpCenterUrl} target="_blank" rel="noopener noreferrer">
          <button type="button">Manage priority ranking on our website</button>
        </a>
      )}
    </div>
  );
}
