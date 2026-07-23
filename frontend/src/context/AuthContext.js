import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          // Verify token is still valid
          await api.get('/auth/me');
        } catch (error) {
          const status = error?.response?.status;
          if (status === 401) {
            // Token is genuinely expired or invalid — log out
            console.warn('Token expired, logging out.');
            logout();
          } else {
            // Network error / server cold-start (Render spin-up) — keep the user logged in
            console.warn('Could not verify token (server unreachable), keeping session alive.');
          }
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  const login = async (credentials, role) => {
    try {
      const endpoint = role === 'customer' 
        ? '/auth/customer/verify-otp' 
        : '/auth/login';
      
      const response = await api.post(endpoint, credentials);
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
      
      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    setUser,
    login,
    logout,
    loading,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
