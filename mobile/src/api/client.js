import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://simplepay-aqqv.onrender.com/api';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('simplepay_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
