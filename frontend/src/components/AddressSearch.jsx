import React, { useState } from 'react';
import { api } from '../api';

export default function AddressSearch({ onFound }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/geocode', { params: { q: query } });
      onFound({ lat: data.lat, lng: data.lng, label: data.display_name });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not find that address');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="address-search">
      <input
        type="text"
        placeholder="Or type a street address / suburb (e.g. Borrowdale, Harare)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" disabled={loading || !query.trim()}>
        {loading ? 'Searching…' : 'Find'}
      </button>
      {error && <p className="error" style={{ width: '100%', marginTop: 4 }}>{error}</p>}
    </form>
  );
}
