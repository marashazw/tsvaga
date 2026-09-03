import React from 'react';

export default function RequestModePrompt({ onChoose }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <h3 style={{ marginTop: 0, color: 'var(--forest)' }}>What do you need today?</h3>
      <p className="hint" style={{ marginBottom: 16 }}>Choose one to get started.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onChoose('product')} style={{ minWidth: 160 }}>
          🛒 A product
        </button>
        <button type="button" className="secondary" onClick={() => onChoose('service')} style={{ minWidth: 160 }}>
          🔧 A service
        </button>
      </div>
    </div>
  );
}
