import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.phone, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Simple<span style={{ color: '#1a6b3c' }}>Pay</span></h1>
        <p style={styles.subtitle}>Unified Payments · Sierra Leone</p>
        <h2 style={styles.heading}>Sign in</h2>
        {error && <div style={styles.errorBox}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={styles.label}>Phone number</label>
          <input style={styles.input} type="tel" placeholder="077 123 456" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" placeholder="Your password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={styles.link}>No account? <Link to="/register">Create one</Link></p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' },
  card: { background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  logo: { fontSize: '24px', fontWeight: '600', color: '#1a6b3c', marginBottom: '4px' },
  subtitle: { fontSize: '13px', color: '#888', marginBottom: '1.5rem' },
  heading: { fontSize: '18px', fontWeight: '500', marginBottom: '1rem' },
  label: { display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', marginTop: '1.5rem' },
  errorBox: { background: '#fde8e8', color: '#a32d2d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' },
  link: { textAlign: 'center', marginTop: '1rem', fontSize: '13px', color: '#888' },
};