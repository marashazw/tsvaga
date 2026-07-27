import React, { useEffect, useState } from 'react';
import { api } from '../api';
import AdvertiseForm from './AdvertiseForm.jsx';

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

export default function AdvertisingSection() {
  const [myAds, setMyAds] = useState([]);
  const [renewingAd, setRenewingAd] = useState(null);

  async function loadMyAds() {
    try {
      const { data } = await api.get('/ads/me');
      setMyAds(data);
    } catch {
      // not a big deal if this fails silently - the "Advertise with us" button still works
    }
  }

  useEffect(() => {
    loadMyAds();
  }, []);

  function handleRenewed() {
    setRenewingAd(null);
    loadMyAds();
  }

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
                  {ad.status === 'expired' && (
                    <>
                      <p className="hint">This ad has expired. Pay to renew and keep it running.</p>
                      <button onClick={() => setRenewingAd(ad)}>Renew this ad</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {renewingAd ? (
        <AdvertiseForm key={renewingAd.id} prefill={renewingAd} onSubmitted={handleRenewed} />
      ) : (
        <AdvertiseForm onSubmitted={loadMyAds} />
      )}
    </div>
  );
}
