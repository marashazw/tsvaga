import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CATEGORIES } from '../categories.js';

export default function VendorCategoryPreferences() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null); // null = still loading
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/vendors/me/notify-categories')
      .then(({ data }) => setSelected(data.selected || []))
      .catch(() => setSelected(CATEGORIES.map((c) => c.slug)));
  }, []);

  function toggle(slug) {
    setSaved(false);
    setSelected((prev) => (prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]));
  }

  function selectAll() {
    setSaved(false);
    setSelected(CATEGORIES.map((c) => c.slug));
  }

  function miscellaneousOnly() {
    setSaved(false);
    setSelected(['miscellaneous']);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch('/vendors/me/notify-categories', { categories: selected });
      setSelected(data.selected);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (selected === null) return null;

  const summary =
    selected.length === CATEGORIES.length
      ? 'All categories'
      : selected.length === 0
        ? 'None selected'
        : `${selected.length} of ${CATEGORIES.length} categories`;

  return (
    <div className="panel">
      <button type="button" className="category-accordion-toggle" onClick={() => setOpen((o) => !o)}>
        <span>🔔 Notify me about: {summary}</span>
        <span>{open ? '▲' : '▼ edit'}</span>
      </button>
      {open && (
        <div className="category-accordion-body">
          <p className="hint" style={{ marginTop: 0 }}>
            Only get alerted about nearby requests in the categories you pick here. A request that isn't
            categorized at all still reaches every vendor, regardless of this setting.
          </p>
          <div className="admin-actions" style={{ marginBottom: 10 }}>
            <button type="button" className="secondary" onClick={selectAll}>Select all</button>
            <button type="button" className="secondary" onClick={miscellaneousOnly}>Miscellaneous only</button>
          </div>
          {CATEGORIES.map((c) => (
            <label key={c.slug} className="category-checkbox">
              <input type="checkbox" checked={selected.includes(c.slug)} onChange={() => toggle(c.slug)} />
              {c.label}
            </label>
          ))}
          {error && <p className="error">{error}</p>}
          <button type="button" onClick={save} disabled={saving} style={{ marginTop: 10 }}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          {saved && <span className="badge status-delivered" style={{ marginLeft: 10 }}>Saved</span>}
        </div>
      )}
    </div>
  );
}
