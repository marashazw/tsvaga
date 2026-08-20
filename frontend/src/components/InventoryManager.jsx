import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';

const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.xlsx', '.xls'];
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_ROWS = 500;

export default function InventoryManager({ inventory, onChange }) {
  const [newProductName, setNewProductName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // File import state
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [productColumn, setProductColumn] = useState(0);
  const [priceColumn, setPriceColumn] = useState(1);
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
      // Reuses an existing product with the same name if one already exists
      // (handled server-side), otherwise creates a new one.
      const { data: product } = await api.post('/products', { name: newProductName.trim() });

      const { data } = await api.post('/vendors/me/inventory', {
        product_id: product.id,
        in_stock: true,
        typical_price: price ? Number(price) : null,
      });
      onChange([...inventory.filter((i) => i.product_id !== product.id), { ...data, name: product.name }]);
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
    });
    onChange(inventory.map((i) => (i.product_id === item.product_id ? { ...i, in_stock: data.in_stock } : i)));
  }

  function resetImport() {
    setImportHeaders([]);
    setImportRows([]);
    setImportError(null);
    setImportSummary(null);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
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
        // Best-effort auto-detect of which column is which, from common header names.
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
    const workingList = [...inventory];

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
        const merged = { ...invItem, name: product.name };
        const idx = workingList.findIndex((i) => i.product_id === product.id);
        if (idx >= 0) workingList[idx] = merged;
        else workingList.push(merged);
        created++;
      } catch (err) {
        skipped++;
      }
    }

    onChange(workingList);
    setImporting(false);
    setImportSummary(
      `Imported ${created} product${created === 1 ? '' : 's'}.` +
        (skipped ? ` Skipped ${skipped} row${skipped === 1 ? '' : 's'} with a missing/invalid product name or price.` : '')
    );
    setImportHeaders([]);
    setImportRows([]);
  }

  const visibleInventory = showAll ? inventory : inventory.slice(0, 5);

  return (
    <div className="inventory">
      <h3>Your inventory</h3>
      {inventory.length === 0 && <p className="hint">No products added yet — add your first one below.</p>}
      <ul className="inventory-list">
        {visibleInventory.map((item) => (
          <li key={item.product_id} className="inventory-item">
            <span>{item.name}</span>
            <span className="price">{item.typical_price ? `$${Number(item.typical_price).toFixed(2)}` : '—'}</span>
            <button className={item.in_stock ? 'stock-btn in' : 'stock-btn out'} onClick={() => toggleStock(item)}>
              {item.in_stock ? 'In stock' : 'Out of stock'}
            </button>
          </li>
        ))}
      </ul>
      {inventory.length > 5 && (
        <button type="button" className="link-btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show less' : `Show more (${inventory.length - 5} more)`}
        </button>
      )}

      <div className="category-accordion" style={{ marginTop: 14 }}>
        <div className="category-accordion-body">
          <h4 style={{ marginTop: 0 }}>📁 Import from file</h4>
          <p className="hint">
            Upload a CSV or Excel file with one product per row. It must include a column for the product name and
            a column for its price.
          </p>
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
                {importing ? 'Importing…' : `Import ${importRows.length} product${importRows.length === 1 ? '' : 's'}`}
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
        <input
          type="text"
          placeholder="Or type a product name"
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
        />
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
