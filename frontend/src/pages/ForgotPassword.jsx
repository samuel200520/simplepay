import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(phone);
      setSent(true);
      // Navigate to reset page after brief delay
      setTimeout(() => navigate('/reset-password', { state: { phone } }), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconBox}>✅</div>
          <h2 style={styles.heading}>Check your phone</h2>
          <p style={styles.infoText}>
            We've sent a reset code to your phone. Use code <strong>1234</strong> to reset your password.
          </p>
          <button style={styles.btn} onClick={() => navigate('/reset-password', { state: { phone } })}>
            Enter reset code
          </button>
          <p style={styles.link}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo.png" alt="SimplePay" style={styles.logoImg} />
        <p style={styles.subtitle}>Unified Payments · Sierra Leone</p>
        <h2 style={styles.heading}>Reset password</h2>
        <p style={styles.infoText}>Enter your phone number to receive a reset code.</p>
        {error && <div style={styles.errorBox}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={styles.label}>Phone number</label>
          <input
            style={styles.input}
            type="tel"
            placeholder="077 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Sending code...' : 'Send reset code'}
          </button>
        </form>
        <p style={styles.link}>
          Remember your password? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' },
  card: { background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', textAlign: 'center' },
  logoImg: { width: '80px', height: '80px', objectFit: 'contain', marginBottom: '8px' },
  subtitle: { fontSize: '13px', color: '#888', marginBottom: '1.5rem' },
  heading: { fontSize: '18px', fontWeight: '500', marginBottom: '1rem' },
  infoText: { fontSize: '13px', color: '#666', marginBottom: '1.5rem', lineHeight: '1.5' },
  label: { display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px', marginTop: '12px', textAlign: 'left' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', marginTop: '1.5rem' },
  errorBox: { background: '#fde8e8', color: '#a32d2d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' },
  link: { textAlign: 'center', marginTop: '1rem', fontSize: '13px', color: '#888' },
  iconBox: { fontSize: '48px', marginBottom: '1rem' },
};

