import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CATEGORIES } from '../categories.js';

const MODES = [
  { value: 'categories', label: 'Selected categories only' },
  { value: 'categories_and_inventory', label: 'Selected categories AND my inventory' },
  { value: 'inventory_only', label: 'My inventory only' },
];

export default function VendorCategoryPreferences() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null); // null = still loading
  const [mode, setMode] = useState('categories');
  const [showInventoryPrompt, setShowInventoryPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/vendors/me/notify-categories')
      .then(({ data }) => {
        setSelected(data.selected || []);
        setMode(data.mode || 'categories');
      })
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

  function chooseMode(nextMode) {
    setSaved(false);
    setMode(nextMode);
    // Only pop the "go add your inventory" prompt when inventory becomes
    // relevant to this mode - no point prompting for "categories only".
    if (nextMode === 'categories_and_inventory' || nextMode === 'inventory_only') {
      setShowInventoryPrompt(true);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch('/vendors/me/notify-categories', { categories: selected, mode });
      setSelected(data.selected);
      setMode(data.mode);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (selected === null) return null;

  const usesInventory = mode === 'categories_and_inventory' || mode === 'inventory_only';
  const categoriesDisabled = mode === 'inventory_only';

  const summary =
    mode === 'inventory_only'
      ? 'My inventory only'
      : mode === 'categories_and_inventory'
        ? `${selected.length === CATEGORIES.length ? 'All categories' : `${selected.length} categories`} + inventory`
        : selected.length === CATEGORIES.length
          ? 'All categories'
          : selected.length === 0
            ? 'None selected'
            : `${selected.length} of ${CATEGORIES.length} categories`;

  return (
    <div className="panel" style={{ maxWidth: 480, margin: '0 auto' }}>
      <button type="button" className="category-accordion-toggle" onClick={() => setOpen((o) => !o)}>
        <span>🔔 Notify me about: {summary}</span>
        <span>{open ? '▲' : '▼ edit'}</span>
      </button>
      {open && (
        <div className="category-accordion-body">
          <p className="hint" style={{ marginTop: 0, fontWeight: 600 }}>How should we match requests to you?</p>
          {MODES.map((m) => (
            <label key={m.value} className="category-checkbox">
              <input
                type="radio"
                name="notify_mode"
                checked={mode === m.value}
                onChange={() => chooseMode(m.value)}
              />
              {m.label}
            </label>
          ))}

          {usesInventory && showInventoryPrompt && (
            <div className="panel subscription-panel unpaid" style={{ margin: '10px 0 12px' }}>
              <strong>Already have items in your inventory?</strong>{' '}
              <a href="#section-inventory">Click here to put items in.</a>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowInventoryPrompt(false)}
                >
                  I already have my inventory sorted
                </button>
              </div>
            </div>
          )}

          {mode === 'inventory_only' ? (
            <p className="hint">
              Category selection below is ignored - you'll only be alerted about a request if it matches a
              product already in your inventory.
            </p>
          ) : mode === 'categories_and_inventory' ? (
            <p className="hint">
              You'll be alerted if a request matches either your selected categories below OR something already
              in your inventory.
            </p>
          ) : (
            <p className="hint">
              Only get alerted about nearby requests in the categories you pick here. A request that isn't
              categorized at all still reaches every vendor, regardless of this setting.
            </p>
          )}

          <div className="admin-actions" style={{ marginBottom: 10 }}>
            <button type="button" className="secondary" onClick={selectAll} disabled={categoriesDisabled}>
              Select all
            </button>
            <button type="button" className="secondary" onClick={miscellaneousOnly} disabled={categoriesDisabled}>
              Miscellaneous only
            </button>
          </div>
          {CATEGORIES.map((c) => (
            <label
              key={c.slug}
              className="category-checkbox"
              style={categoriesDisabled ? { opacity: 0.5 } : undefined}
            >
              <input
                type="checkbox"
                checked={selected.includes(c.slug)}
                onChange={() => toggle(c.slug)}
                disabled={categoriesDisabled}
              />
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
