import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState(location.state?.phone || '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!phone || !otp || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(phone, otp, newPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconBox}>✅</div>
          <h2 style={styles.heading}>Password reset!</h2>
          <p style={styles.infoText}>
            Your password has been reset successfully. Redirecting to sign in...
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
        <h2 style={styles.heading}>Enter reset code</h2>
        <p style={styles.infoText}>Enter the code sent to your phone and your new password.</p>
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
          <label style={styles.label}>Reset code</label>
          <input
            style={styles.input}
            type="text"
            placeholder="Enter code (1234)"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <label style={styles.label}>New password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Min. 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <label style={styles.label}>Confirm new password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
        <p style={styles.link}>
          <Link to="/forgot-password">Resend code</Link> · <Link to="/login">Back to sign in</Link>
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

