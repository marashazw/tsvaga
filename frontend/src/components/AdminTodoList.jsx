import React from 'react';

export default function AdminTodoList({ pendingPaymentsCount, pendingPriorityCount, pendingAdsCount }) {
  const tasks = [
    {
      count: pendingPaymentsCount,
      label: 'subscription payment confirmation',
      anchor: '#section-payment-submissions',
    },
    {
      count: pendingPriorityCount,
      label: 'priority boost payment confirmation',
      anchor: '#section-priority-submissions',
    },
    {
      count: pendingAdsCount,
      label: 'ad awaiting approval',
      anchor: '#section-ads',
    },
  ].filter((t) => t.count > 0);

  return (
    <div className="panel todo-panel">
      <h2 style={{ marginTop: 0 }}>To do</h2>
      {tasks.length === 0 ? (
        <p className="hint">Nothing pending right now — you're all caught up! ✅</p>
      ) : (
        <ul className="todo-list">
          {tasks.map((t) => (
            <li key={t.anchor}>
              <a href={t.anchor}>
                <span className="todo-count">{t.count}</span>
                {' '}
                {t.label}
                {t.count > 1 ? 's' : ''} to review →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
