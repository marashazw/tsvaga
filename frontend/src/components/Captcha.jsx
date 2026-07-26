import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Captcha({ onChange, refreshSignal }) {
  const [question, setQuestion] = useState('');
  const [token, setToken] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadCaptcha() {
    setLoading(true);
    try {
      const { data } = await api.get('/captcha');
      setQuestion(data.question);
      setToken(data.token);
      setAnswer('');
      onChange({ token: data.token, answer: '' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  function handleAnswerChange(e) {
    setAnswer(e.target.value);
    onChange({ token, answer: e.target.value });
  }

  return (
    <label>
      Quick check: {loading ? 'loading…' : question}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          value={answer}
          onChange={handleAnswerChange}
          placeholder="Your answer"
          required
          style={{ flex: 1 }}
        />
        <button type="button" className="secondary" onClick={loadCaptcha} title="Get a new question">
          ↻
        </button>
      </div>
    </label>
  );
}
