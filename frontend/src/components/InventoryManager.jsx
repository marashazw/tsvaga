import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function InventoryManager({ inventory, onChange }) {
  const [catalog, setCatalog] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/products').then(({ data }) => setCatalog(data)).catch(() => {});
  }, []);

  async function addOrUpdate(e) {
    e.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const { data } = await api.post('/vendors/me/inventory', {
        product_id: selectedProduct,
        in_stock: true,
        typical_price: price ? Number(price) : null,
      });
      const product = catalog.find((p) => p.id === selectedProduct);
      onChange([...inventory.filter((i) => i.product_id !== selectedProduct), { ...data, name: product?.name }]);
      setSelectedProduct('');
      setPrice('');
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

  return (
    <div className="inventory">
      <h3>Your inventory</h3>
      {inventory.length === 0 && <p className="hint">No products added yet — add your first one below.</p>}
      <ul className="inventory-list">
        {inventory.map((item) => (
          <li key={item.product_id} className="inventory-item">
            <span>{item.name}</span>
            <span className="price">{item.typical_price ? `$${Number(item.typical_price).toFixed(2)}` : '—'}</span>
            <button className={item.in_stock ? 'stock-btn in' : 'stock-btn out'} onClick={() => toggleStock(item)}>
              {item.in_stock ? 'In stock' : 'Out of stock'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={addOrUpdate} className="inventory-form">
        <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} required>
          <option value="">Add a product…</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
    </div>
  );
}
