import axios from 'axios';

// Default to localhost:5000 if REACT_APP_API_URL is not set
const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/customer/verify-otp');
    const isVerifyRoute = error.config?.url?.includes('/auth/me');
    const isOnLoginPage = window.location.pathname === '/login' || window.location.pathname === '/' || window.location.pathname === '/admin';

    if (error.response?.status === 401 && !isAuthRoute) {
      // Don't force logout on the /auth/me check during splash/startup (handled in AuthContext)
      if (isVerifyRoute && isOnLoginPage) {
        return Promise.reject(error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
