import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Simple<span style={{ color: '#1a6b3c' }}>Pay</span></h1>
        <p style={styles.subtitle}>Unified Payments · Sierra Leone</p>
        <h2 style={styles.heading}>Create account</h2>
        {error && <div style={styles.errorBox}>{error}</div>}
        <form onSubmit={handleSubmit}>
          {[
            { field: 'full_name', label: 'Full name', type: 'text', placeholder: 'Mohamed Kamara' },
            { field: 'phone', label: 'Phone number', type: 'tel', placeholder: '077 123 456' },
            { field: 'email', label: 'Email (optional)', type: 'email', placeholder: 'you@example.com' },
            { field: 'password', label: 'Password', type: 'password', placeholder: 'Min. 8 characters' },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label style={styles.label}>{label}</label>
              <input style={styles.input} type={type} placeholder={placeholder} value={form[field]} onChange={update(field)} required={field !== 'email'} />
            </div>
          ))}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p style={styles.link}>Already have an account? <Link to="/login">Sign in</Link></p>
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