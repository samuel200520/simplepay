import axios from 'axios';

const client = axios.create({
  baseURL: 'https://simplepay-aqqv.onrender.com/api',
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