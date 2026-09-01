import React, { useState } from 'react';
import { api, setAuthToken } from '../api';
import Captcha from './Captcha.jsx';

export default function RequesterAuth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', phone: '+263 ', password: '', role: 'requester', businessName: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registeredAsVendor, setRegisteredAsVendor] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [captcha, setCaptcha] = useState({ token: '', answer: '' });
  const [captchaRefresh, setCaptchaRefresh] = useState(0);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login'
          ? { phone: form.phone, password: form.password }
          : {
              name: form.name,
              phone: form.phone,
              password: form.password,
              role: form.role,
              business_name: form.role !== 'requester' ? form.businessName || form.name : undefined,
              captcha_token: captcha.token,
              captcha_answer: captcha.answer,
            };
      const { data } = await api.post(endpoint, payload);
      setAuthToken(data.token);
      if (mode === 'register' && data.user.role !== 'requester') {
        // Show the "go set up your store" screen first - calling onAuthed here
        // immediately would switch the parent straight to the main app before
        // this screen ever gets a chance to render.
        setPendingUser(data.user);
        setRegisteredAsVendor(true);
      } else {
        onAuthed(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
      if (err.response?.data?.captcha_failed) {
        setCaptchaRefresh((n) => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  if (registeredAsVendor) {
    return (
      <div className="panel auth-panel">
        <h2>Account created!</h2>
        <p className="hint">
          You're signed in here as a customer too. Since you also registered as a vendor, head to your store
          dashboard to set your location, subscribe, and start receiving nearby requests.
        </p>
        <a href="/vendor.html">
          <button type="button">Go to vendor dashboard</button>
        </a>
        <button className="link-btn" onClick={() => onAuthed(pendingUser)}>
          Continue here as a customer instead
        </button>
      </div>
    );
  }

  return (
    <div className="panel auth-panel">
      <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <>
            <label>
              Your name
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </label>

            <fieldset className="fulfillment-choice">
              <legend>What do you want to do?</legend>
              <label className="radio-label">
                <input
                  type="radio"
                  name="account_role"
                  checked={form.role === 'requester'}
                  onChange={() => update('role', 'requester')}
                />
                Just look for products
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="account_role"
                  checked={form.role === 'vendor'}
                  onChange={() => update('role', 'vendor')}
                />
                I want to sell as a vendor
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="account_role"
                  checked={form.role === 'both'}
                  onChange={() => update('role', 'both')}
                />
                Both
              </label>
            </fieldset>

            {form.role !== 'requester' && (
              <label>
                Store name
                <input
                  value={form.businessName}
                  onChange={(e) => update('businessName', e.target.value)}
                  placeholder="e.g. Avondale Mini Market"
                />
              </label>
            )}

            <Captcha onChange={setCaptcha} refreshSignal={captchaRefresh} />
          </>
        )}
        <label>
          Phone number
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+263 7..." required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? "New here? Create an account" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
