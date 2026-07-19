import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('simplepay_token');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await client.get('/user/profile');
      setUser(res.data.user);
      setWallet(res.data.wallet);
    } catch {
      localStorage.removeItem('simplepay_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (phone, password) => {
    const res = await client.post('/auth/login', { phone, password });
    localStorage.setItem('simplepay_token', res.data.token);
    setUser(res.data.user);
    await fetchProfile();
    return res.data;
  };

  const register = async (data) => {
    const res = await client.post('/auth/register', data);
    localStorage.setItem('simplepay_token', res.data.token);
    setUser(res.data.user);
    await fetchProfile();
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('simplepay_token');
    setUser(null);
    setWallet(null);
  };

  return (
    <AuthContext.Provider value={{ user, wallet, loading, login, register, logout, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);