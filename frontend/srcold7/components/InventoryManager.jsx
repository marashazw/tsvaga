import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function InventoryManager({ inventory, onChange }) {
  const [catalog, setCatalog] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/products').then(({ data }) => setCatalog(data)).catch(() => {});
  }, []);

  async function addOrUpdate(e) {
    e.preventDefault();
    setError(null);

    if (!selectedProduct && !newProductName.trim()) {
      setError('Choose a product from the list, or type a new one.');
      return;
    }

    setSaving(true);
    try {
      let productId = selectedProduct;
      let productName;

      if (!productId) {
        // Not in the catalog yet - create it (or reuse an existing one with
        // the same name, which the backend handles for us).
        const { data: newProduct } = await api.post('/products', { name: newProductName.trim() });
        productId = newProduct.id;
        productName = newProduct.name;
        setCatalog((prev) => (prev.some((p) => p.id === newProduct.id) ? prev : [...prev, newProduct]));
      } else {
        productName = catalog.find((p) => p.id === productId)?.name;
      }

      const { data } = await api.post('/vendors/me/inventory', {
        product_id: productId,
        in_stock: true,
        typical_price: price ? Number(price) : null,
      });
      onChange([...inventory.filter((i) => i.product_id !== productId), { ...data, name: productName }]);
      setSelectedProduct('');
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
        <select
          value={selectedProduct}
          onChange={(e) => {
            setSelectedProduct(e.target.value);
            if (e.target.value) setNewProductName('');
          }}
        >
          <option value="">Choose from catalog…</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="hint" style={{ alignSelf: 'center' }}>or</span>
        <input
          type="text"
          placeholder="Type a new product name"
          value={newProductName}
          onChange={(e) => {
            setNewProductName(e.target.value);
            if (e.target.value) setSelectedProduct('');
          }}
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
