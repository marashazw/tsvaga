import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';

const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.xlsx', '.xls'];
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_ROWS = 500;

// Sorts a copy of the list - 'date' relies on the backend's own
// created_at-DESC ordering (so this is a no-op, just returns as-is),
// 'category' sorts alphabetically by category, with anything uncategorized
// pushed to the end rather than sorting unpredictably at the top.
function sortItems(items, sortBy) {
  if (sortBy !== 'category') return items;
  return [...items].sort((a, b) => {
    const catA = a.category || '\uffff';
    const catB = b.category || '\uffff';
    return catA.localeCompare(catB);
  });
}

export default function InventoryManager({ inventory, onChange }) {
  const [newProductName, setNewProductName] = useState('');
  const [price, setPrice] = useState('');
  const [itemType, setItemType] = useState('product'); // 'product' | 'service'
  const [pricingType, setPricingType] = useState('fixed'); // 'fixed' | 'hourly' | 'starting_from'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [sortBy, setSortBy] = useState('date'); // 'date' | 'category'
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');

  // File import state
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [productColumn, setProductColumn] = useState(0);
  const [priceColumn, setPriceColumn] = useState(1);
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  async function addOrUpdate(e) {
    e.preventDefault();
    setError(null);

    if (!newProductName.trim()) {
      setError('Type a product name first.');
      return;
    }

    setSaving(true);
    try {
      const { data: product } = await api.post('/products', { name: newProductName.trim(), type: itemType });

      const { data } = await api.post('/vendors/me/inventory', {
        product_id: product.id,
        in_stock: true,
        typical_price: price ? Number(price) : null,
        pricing_type: itemType === 'service' ? pricingType : 'fixed',
      });
      onChange([{ ...data, name: product.name, type: product.type, category: product.category }, ...inventory.filter((i) => i.product_id !== product.id)]);
      setNewProductName('');
      setPrice('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStock(item) {
    const { data } = await api.post('/vendors/me/inventory', {
      product_id: item.product_id,
      in_stock: !item.in_stock,
      typical_price: item.typical_price,
      pricing_type: item.pricing_type,
    });
    onChange(inventory.map((i) => (i.product_id === item.product_id ? { ...i, in_stock: data.in_stock } : i)));
  }

  // Bulk version of the same toggle above, for temporarily pulling several
  // items out of stock (or bringing them back) at once, without deleting
  // anything - e.g. "everything from this supplier is out until Friday".
  async function bulkSetStock(inStock) {
    const items = inventory.filter((i) => selectedIds.has(i.product_id));
    if (!items.length) return;
    for (const item of items) {
      try {
        await api.post('/vendors/me/inventory', {
          product_id: item.product_id,
          in_stock: inStock,
          typical_price: item.typical_price,
          pricing_type: item.pricing_type,
        });
      } catch (err) {
        // continue updating the rest even if one fails
      }
    }
    const ids = new Set(items.map((i) => i.product_id));
    onChange(inventory.map((i) => (ids.has(i.product_id) ? { ...i, in_stock: inStock } : i)));
  }

  function startEdit(item) {
    setEditingId(item.product_id);
    setEditPrice(item.typical_price ?? '');
  }

  async function saveEdit(item) {
    try {
      const { data } = await api.post('/vendors/me/inventory', {
        product_id: item.product_id,
        in_stock: item.in_stock,
        typical_price: editPrice ? Number(editPrice) : null,
        pricing_type: item.pricing_type,
      });
      onChange(inventory.map((i) => (i.product_id === item.product_id ? { ...i, typical_price: data.typical_price } : i)));
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save price');
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Remove "${item.name}" from your inventory?`)) return;
    try {
      await api.delete(`/vendors/me/inventory/${item.product_id}`);
      onChange(inventory.filter((i) => i.product_id !== item.product_id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.product_id);
        return next;
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete item');
    }
  }

  function toggleSelect(productId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!window.confirm(`Remove ${selectedIds.size} selected item${selectedIds.size > 1 ? 's' : ''} from your inventory?`)) {
      return;
    }
    const ids = [...selectedIds];
    for (const id of ids) {
      try {
        await api.delete(`/vendors/me/inventory/${id}`);
      } catch (err) {
        // continue removing the rest even if one fails
      }
    }
    onChange(inventory.filter((i) => !ids.includes(i.product_id)));
    setSelectedIds(new Set());
  }

  function resetImport() {
    setImportHeaders([]);
    setImportRows([]);
    setImportError(null);
    setImportSummary(null);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    resetImport();

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      setImportError('Only .csv, .txt, .xlsx, or .xls files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setImportError('File is too large (max 2MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false });
        if (!rows.length) {
          setImportError('No data found in this file.');
          return;
        }
        const headerRow = rows[0].map((h) => String(h ?? '').trim());
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== undefined && cell !== ''));
        if (!dataRows.length) {
          setImportError('No product rows found below the header row.');
          return;
        }
        if (dataRows.length > MAX_ROWS) {
          setImportError(`This file has ${dataRows.length} rows - please split it into batches of ${MAX_ROWS} or fewer.`);
          return;
        }
        setImportHeaders(headerRow);
        setImportRows(dataRows);
        const guessedProduct = headerRow.findIndex((h) => /product|item|name/i.test(h));
        const guessedPrice = headerRow.findIndex((h) => /price|cost|amount/i.test(h));
        setProductColumn(guessedProduct >= 0 ? guessedProduct : 0);
        setPriceColumn(guessedPrice >= 0 ? guessedPrice : headerRow.length > 1 ? 1 : 0);
      } catch (err) {
        setImportError('Could not read this file - make sure it is a valid CSV or Excel file.');
      }
    };
    reader.onerror = () => setImportError('Failed to read the file.');
    reader.readAsArrayBuffer(file);
  }

  async function runImport() {
    setImporting(true);
    setImportError(null);
    let created = 0;
    let skipped = 0;

    if (importMode === 'replace') {
      if (
        !window.confirm(
          `This will DELETE your entire current inventory (${inventory.length} item${inventory.length === 1 ? '' : 's'}) and replace it with this file. This can't be undone. Continue?`
        )
      ) {
        setImporting(false);
        return;
      }
      try {
        await api.delete('/vendors/me/inventory');
      } catch (err) {
        setImportError('Failed to clear your existing inventory - import cancelled, nothing was changed.');
        setImporting(false);
        return;
      }
    }

    const workingList = importMode === 'replace' ? [] : [...inventory];

    for (const row of importRows) {
      const name = row[productColumn] != null ? String(row[productColumn]).trim() : '';
      const priceNum = parseFloat(row[priceColumn]);
      if (!name || Number.isNaN(priceNum) || priceNum < 0) {
        skipped++;
        continue;
      }
      try {
        const { data: product } = await api.post('/products', { name });
        const { data: invItem } = await api.post('/vendors/me/inventory', {
          product_id: product.id,
          in_stock: true,
          typical_price: priceNum,
        });
        const merged = { ...invItem, name: product.name, type: product.type, category: product.category };
        const idx = workingList.findIndex((i) => i.product_id === product.id);
        if (idx >= 0) workingList[idx] = merged;
        else workingList.unshift(merged);
        created++;
      } catch (err) {
        skipped++;
      }
    }

    onChange(workingList);
    setImporting(false);
    setImportSummary(
      (importMode === 'replace' ? `Replaced your inventory with ${created} product${created === 1 ? '' : 's'}.` : `Imported ${created} product${created === 1 ? '' : 's'}.`) +
        (skipped ? ` Skipped ${skipped} row${skipped === 1 ? '' : 's'} with a missing/invalid product name or price.` : '')
    );
    setImportHeaders([]);
    setImportRows([]);
  }

  const products = sortItems(inventory.filter((i) => i.type !== 'service'), sortBy);
  const services = sortItems(inventory.filter((i) => i.type === 'service'), sortBy);

  function renderSection({ title, icon, items, showAll, setShowAll, emptyHint }) {
    const visible = showAll ? items : items.slice(0, 5);
    const allVisibleSelected = visible.length > 0 && visible.every((i) => selectedIds.has(i.product_id));

    function toggleSelectAllVisible() {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (allVisibleSelected) {
          visible.forEach((i) => next.delete(i.product_id));
        } else {
          visible.forEach((i) => next.add(i.product_id));
        }
        return next;
      });
    }

    return (
      <div style={{ marginBottom: 18 }}>
        <h4 style={{ margin: '0 0 6px' }}>
          {icon} {title} ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="hint">{emptyHint}</p>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              <span className="hint">Select all shown</span>
            </label>
            <ul className="inventory-list">
              {visible.map((item) => (
                <li key={item.product_id} className="inventory-item">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.product_id)}
                      onChange={() => toggleSelect(item.product_id)}
                    />
                    <span>
                      {item.name}
                      {item.category && <span className="hint" style={{ marginLeft: 6 }}>· {item.category}</span>}
                    </span>
                  </label>
                  {editingId === item.product_id ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        style={{ width: 80 }}
                      />
                      <button type="button" onClick={() => saveEdit(item)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingId(null)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="price">
                        {item.typical_price
                          ? item.pricing_type === 'hourly'
                            ? `$${Number(item.typical_price).toFixed(2)}/hr`
                            : item.pricing_type === 'starting_from'
                              ? `From $${Number(item.typical_price).toFixed(2)}`
                              : `$${Number(item.typical_price).toFixed(2)}`
                          : '—'}
                      </span>
                      <button className={item.in_stock ? 'stock-btn in' : 'stock-btn out'} onClick={() => toggleStock(item)}>
                        {item.type === 'service'
                          ? item.in_stock ? 'Available' : 'Not available'
                          : item.in_stock ? 'In stock' : 'Out of stock'}
                      </button>
                      {selectedIds.has(item.product_id) && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => startEdit(item)}
                            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          >
                            Edit price
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => deleteItem(item)}
                            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {items.length > 5 && (
              <button type="button" className="link-btn" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show less' : `Show more (${items.length - 5} more)`}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="inventory">
      <div className="alert-main">
        <h3 style={{ margin: 0 }}>Your inventory</h3>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          Sort by:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Date added</option>
            <option value="category">Category</option>
          </select>
        </label>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
          <span className="hint" style={{ alignSelf: 'center' }}>{selectedIds.size} selected:</span>
          <button type="button" className="secondary" onClick={() => bulkSetStock(false)}>
            Mark out of stock/unavailable
          </button>
          <button type="button" className="secondary" onClick={() => bulkSetStock(true)}>
            Mark in stock/available
          </button>
          <button type="button" className="secondary" onClick={deleteSelected}>
            Delete selected
          </button>
        </div>
      )}

      {inventory.length === 0 && <p className="hint">No products or services added yet — add your first one below.</p>}

      {renderSection({
        title: 'Products',
        icon: '🛒',
        items: products,
        showAll: showAllProducts,
        setShowAll: setShowAllProducts,
        emptyHint: 'No products added yet.',
      })}
      {renderSection({
        title: 'Services',
        icon: '🔧',
        items: services,
        showAll: showAllServices,
        setShowAll: setShowAllServices,
        emptyHint: 'No services added yet.',
      })}

      <div className="category-accordion" style={{ marginTop: 14 }}>
        <div className="category-accordion-body">
          <h4 style={{ marginTop: 0 }}>📁 Import from file</h4>
          <p className="hint">
            Upload a CSV or Excel file with one product per row. It must include a column for the product name and
            a column for its price.
          </p>

          <div style={{ margin: '8px 0' }}>
            <label className="radio-label">
              <input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
              Add to my existing list (updates matching items, keeps everything else)
            </label>
            <label className="radio-label">
              <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
              Replace my entire inventory with this file
            </label>
            {importMode === 'replace' && (
              <p className="error" style={{ margin: '4px 0 0' }}>
                ⚠️ This deletes every item currently in your inventory first. This can't be undone.
              </p>
            )}
          </div>

          <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileSelect} />

          {importHeaders.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'inline-block', marginRight: 12 }}>
                Product column:{' '}
                <select value={productColumn} onChange={(e) => setProductColumn(Number(e.target.value))}>
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'inline-block' }}>
                Price column:{' '}
                <select value={priceColumn} onChange={(e) => setPriceColumn(Number(e.target.value))}>
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint" style={{ marginTop: 8 }}>
                {importRows.length} row{importRows.length === 1 ? '' : 's'} found. First row: "
                {String(importRows[0]?.[productColumn] ?? '')}" at ${String(importRows[0]?.[priceColumn] ?? '')}
              </p>
              <button type="button" onClick={runImport} disabled={importing}>
                {importing
                  ? importMode === 'replace'
                    ? 'Replacing…'
                    : 'Importing…'
                  : importMode === 'replace'
                    ? `Replace inventory with ${importRows.length} product${importRows.length === 1 ? '' : 's'}`
                    : `Import ${importRows.length} product${importRows.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="secondary" onClick={resetImport} style={{ marginLeft: 8 }}>
                Cancel
              </button>
            </div>
          )}
          {importError && <p className="error">{importError}</p>}
          {importSummary && <p className="hint">{importSummary}</p>}
        </div>
      </div>

      <form onSubmit={addOrUpdate} className="inventory-form" style={{ marginTop: 14 }}>
        <label className="radio-label" style={{ display: 'inline-flex', gap: 12, marginBottom: 8, width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" name="item_type" checked={itemType === 'product'} onChange={() => setItemType('product')} />
            🛒 Product
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" name="item_type" checked={itemType === 'service'} onChange={() => setItemType('service')} />
            🔧 Service
          </span>
        </label>
        <input
          type="text"
          placeholder={itemType === 'service' ? 'e.g. Plumbing call-out' : 'Or type a product name'}
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
        />
        {itemType === 'service' && (
          <select value={pricingType} onChange={(e) => setPricingType(e.target.value)}>
            <option value="fixed">Flat fee</option>
            <option value="hourly">Per hour</option>
            <option value="starting_from">Starting from</option>
          </select>
        )}
        <input
          type="number"
          step="0.01"
          placeholder="Price ($)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add / update'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
