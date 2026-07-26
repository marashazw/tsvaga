import React, { useCallback, useEffect, useState } from 'react';
import AdminAuth from './components/AdminAuth.jsx';
import AdminSettings from './components/AdminSettings.jsx';
import AdminVendors from './components/AdminVendors.jsx';
import AdminPaymentSubmissions from './components/AdminPaymentSubmissions.jsx';
import { api, loadStoredToken, setAuthToken } from './api';

export default function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      const [{ data: settingsData }, { data: vendorsData }, { data: submissionsData }] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/admin/vendors'),
        api.get('/admin/payment-submissions', { params: { status: 'pending' } }),
      ]);
      setSettings(settingsData);
      setVendors(vendorsData);
      setSubmissions(submissionsData);
      setAuthed(true);
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = loadStoredToken();
    if (token) loadAll();
    else setLoading(false);
  }, [loadAll]);

  function handleVendorChanged(vendorId, subscription) {
    setVendors((prev) =>
      prev.map((v) =>
        v.id === vendorId
          ? { ...v, subscription_status: subscription.status, expires_at: subscription.expires_at }
          : v
      )
    );
  }

  function handleSubmissionReviewed(id, status, subscription) {
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
    if (status === 'approved' && subscription) {
      setVendors((prev) =>
        prev.map((v) =>
          v.id === subscription.vendor_id
            ? { ...v, subscription_status: subscription.status, expires_at: subscription.expires_at }
            : v
        )
      );
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setAuthed(false);
  }

  if (loading) return <div className="app-shell">Loading…</div>;

  if (!authed) {
    return (
      <div className="app-shell">
        <header>
          <h1>Tsvaga</h1>
          <p className="tagline">Admin — manage subscriptions and platform settings.</p>
        </header>
        <AdminAuth onAuthed={loadAll} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="vendor-header">
        <div>
          <h1>Tsvaga Admin</h1>
          <p className="tagline">Manage vendor subscriptions and platform settings.</p>
        </div>
        <button className="secondary" onClick={handleLogout}>Sign out</button>
      </header>

      <section style={{ marginTop: 20 }}>
        <AdminSettings settings={settings} onUpdated={setSettings} />
      </section>

      <section style={{ marginTop: 20 }}>
        <AdminPaymentSubmissions submissions={submissions} onReviewed={handleSubmissionReviewed} />
      </section>

      <section style={{ marginTop: 20 }}>
        <AdminVendors vendors={vendors} onChanged={handleVendorChanged} />
      </section>
    </div>
  );
}
