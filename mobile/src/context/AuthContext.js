import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkToken(); }, []);

  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('simplepay_token');
      if (token) await fetchProfile();
    } catch (err) {
      console.log('Token check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await client.get('/user/profile');
      setUser(res.data.user);
      setWallet(res.data.wallet);
    } catch {
      await AsyncStorage.removeItem('simplepay_token');
    }
  };

  const login = async (phone, password) => {
    const res = await client.post('/auth/login', { phone, password });
    await AsyncStorage.setItem('simplepay_token', res.data.token);
    setUser(res.data.user);
    await fetchProfile();
    return res.data;
  };

  const register = async (data) => {
    const res = await client.post('/auth/register', data);
    await AsyncStorage.setItem('simplepay_token', res.data.token);
    setUser(res.data.user);
    await fetchProfile();
    return res.data;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('simplepay_token');
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