import axios from 'axios';

const httpClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor: handle 401 by trying to refresh token
// Skip auto-refresh for auth endpoints themselves to avoid infinite loops
httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    // Don't retry for auth endpoints or if already retried
    const isAuthEndpoint = url.startsWith('/auth/');
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      try {
        await httpClient.post('/auth/refresh');
        return httpClient(originalRequest);
      } catch {
        // Only redirect if we're not already on an auth page
        if (!window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/register')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default httpClient;
