import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { buildHelpCenterUrl } from '../helpCenter.js';

function statusInfo(ad) {
  if (ad.status === 'active') {
    return { label: `Running until ${new Date(ad.ends_at).toLocaleDateString()}`, cls: 'status-delivered' };
  }
  if (ad.status === 'pending') {
    return { label: 'Awaiting admin approval', cls: 'status-confirmed' };
  }
  if (ad.status === 'rejected') {
    return { label: 'Rejected', cls: 'status-cancelled' };
  }
  if (ad.status === 'expired') {
    return { label: `Expired ${new Date(ad.ends_at).toLocaleDateString()}`, cls: 'status-cancelled' };
  }
  return { label: ad.status, cls: '' };
}

// The actual ad-purchase form has moved to the separate Help Center site -
// see helpCenter.js for why. This just shows the status of any existing ads
// and links out for creating/renewing one.
export default function AdvertisingSection({ phone }) {
  const [myAds, setMyAds] = useState([]);
  const helpCenterUrl = buildHelpCenterUrl(phone);

  useEffect(() => {
    api.get('/ads/me').then(({ data }) => setMyAds(data)).catch(() => {});
  }, []);

  return (
    <div>
      {myAds.length > 0 && (
        <div className="panel" style={{ marginBottom: 12, textAlign: 'left' }}>
          <h3 style={{ marginTop: 0 }}>My ads</h3>
          <ul className="order-list">
            {myAds.map((ad) => {
              const info = statusInfo(ad);
              return (
                <li key={ad.id} className="order-card">
                  <div className="alert-main">
                    <strong>{ad.title}</strong>
                    <span className={`badge ${info.cls}`}>{info.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <a href={helpCenterUrl} target="_blank" rel="noopener noreferrer" className="link-btn">
        📢 Advertise with us
      </a>
    </div>
  );
}
