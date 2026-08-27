import React from 'react';

// The "priming" pattern used by WhatsApp, Instagram, etc: show a friendly,
// low-stakes explanation FIRST, and only trigger the real browser/OS
// permission prompt once the person confirms here. Most browsers only let
// an app show that native prompt a limited number of times (often once) -
// if someone reflexively taps "Block" on a cold prompt, there's usually no
// way to ask again without them manually changing browser settings. Priming
// first means the person already understands the value and has decided
// before the one-shot native prompt appears, which meaningfully improves
// opt-in rates and avoids that dead end.
export default function NotificationPrimer({ message, onConfirm, onDismiss, confirming }) {
  return (
    <div className="panel subscription-panel" style={{ maxWidth: 380, margin: '10px auto', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', lineHeight: 1 }}>🔔</div>
      <p style={{ fontWeight: 600, margin: '8px 0' }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
        <button type="button" className="secondary" onClick={onDismiss} disabled={confirming}>
          Not now
        </button>
        <button type="button" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Enabling…' : 'Turn on notifications'}
        </button>
      </div>
    </div>
  );
}
