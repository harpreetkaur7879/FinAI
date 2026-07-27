import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true // sends/receives the httpOnly refresh-token cookie
});

// In-memory only — never localStorage/sessionStorage (XSS risk for a
// financial app). Lost on hard refresh by design; the refresh-token
// cookie flow below re-establishes a session automatically on load.
let accessToken = null;
const setAccessToken = (token) => {
  accessToken = token;
};
const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// If a request fails with 401 (expired access token), try refreshing
// once via the httpOnly cookie, then retry the original request.
// Prevents every component from having to handle token expiry itself.
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Never try to "refresh" a failed refresh call itself — otherwise a
    // genuinely expired/missing session causes /auth/refresh to 401,
    // which would then try to call /auth/refresh again, looping forever
    // and leaving the UI stuck on "Loading session...".
    const isRefreshCall = originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        const { data } = await refreshPromise;
        setAccessToken(data.data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { api, setAccessToken, getAccessToken };