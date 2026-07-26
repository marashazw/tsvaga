import React, { useState } from 'react';
import { api, setAuthToken } from '../api';
import Captcha from './Captcha.jsx';

export default function VendorAuth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', phone: '', password: '', business_name: '' });
  const [alsoRequester, setAlsoRequester] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
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
              ...form,
              role: alsoRequester ? 'both' : 'vendor',
              captcha_token: captcha.token,
              captcha_answer: captcha.answer,
            };
      const { data } = await api.post(endpoint, payload);
      setAuthToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
      if (err.response?.data?.captcha_failed) {
        setCaptchaRefresh((n) => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel auth-panel">
      <h2>{mode === 'login' ? 'Vendor sign in' : 'Register your store'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <>
            <label>
              Your name
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </label>
            <label>
              Store name
              <input
                value={form.business_name}
                onChange={(e) => update('business_name', e.target.value)}
                placeholder="e.g. Avondale Mini Market"
                required
              />
            </label>
            <label className="radio-label">
              <input type="checkbox" checked={alsoRequester} onChange={(e) => setAlsoRequester(e.target.checked)} />
              I also want to request products as a customer (same login on the main site)
            </label>

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
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create vendor account'}
        </button>
      </form>
      <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? "New store? Register here" : 'Already registered? Sign in'}
      </button>
    </div>
  );
}
