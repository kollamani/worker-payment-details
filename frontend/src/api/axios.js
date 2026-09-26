import axios from 'axios';
import { markServerSessionExpired } from '../context/AuthContext';

const configuredApiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').trim().replace(/\/+$/, '');
const apiBaseUrl = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Reads the JWT `exp` claim without verifying it (the server remains the
// only authority) purely to avoid firing requests with an already-expired
// token. Unparseable tokens are treated as expired.
const isTokenExpired = (token) => {
  try {
    const payloadPart = token.split('.')[1] || '';
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 <= Date.now() : false;
  } catch {
    return true;
  }
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ledger_token');
  if (token && isTokenExpired(token)) {
    // Expired token: drop it now so it is never sent (or usable by any
    // script reading localStorage); the resulting 401 below triggers the
    // standard redirect to /login.
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_admin');
    return config;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('ledger_token');
      localStorage.removeItem('ledger_admin');
      if (!err.config?.skipAuthRedirect) {
        // Tag the logout as server-driven so Login can show the matching
        // banner instead of the inactivity one. No-op on silent background
        // calls — those pass `skipAuthRedirect` and stay on the quiet path.
        markServerSessionExpired();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
