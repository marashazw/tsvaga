import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_BASE });

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('tsvaga_token', token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem('tsvaga_token');
  }
}

export function loadStoredToken() {
  const token = localStorage.getItem('tsvaga_token');
  if (token) setAuthToken(token);
  return token;
}

export const ZIMBABWE_CENTER = { lat: -19.0154, lng: 29.1549 }; // geographic center of Zimbabwe
