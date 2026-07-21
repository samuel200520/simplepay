import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://simplepay-aqqv.onrender.com/api';

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('simplepay_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('simplepay_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;