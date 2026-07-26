import React, { useState } from 'react';
import { api, setAuthToken } from '../api';

export default function AdminAuth({ onAuthed }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { phone, password });
      if (data.user.role !== 'admin') {
        setError('This account does not have admin access.');
        return;
      }
      setAuthToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel auth-panel">
      <h2>Admin sign in</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 7..." required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait…' : 'Sign in'}
        </button>
      </form>
      <p className="hint">
        Admin accounts are created via the backend CLI (<code>npm run create:admin</code>), not through public
        registration.
      </p>
    </div>
  );
}
