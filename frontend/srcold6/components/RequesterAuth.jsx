import React, { useState } from 'react';
import { api, setAuthToken } from '../api';

export default function RequesterAuth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
          : { name: form.name, phone: form.phone, password: form.password, role: 'requester' };
      const { data } = await api.post(endpoint, payload);
      setAuthToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel auth-panel">
      <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <label>
            Your name
            <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </label>
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
