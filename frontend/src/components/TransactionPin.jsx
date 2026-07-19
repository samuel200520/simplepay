import React, { useState } from 'react';

export default function TransactionPin({ onConfirm, onCancel, loading }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setError('');

    if (index < 3 && value) {
      const next = document.getElementById(`pin-${index + 1}`);
      if (next) next.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prev = document.getElementById(`pin-${index - 1}`);
      if (prev) prev.focus();
    }
  };

  const handleSubmit = () => {
    const pinCode = pin.join('');
    if (pinCode.length !== 4) {
      setError('Please enter your 4-digit PIN');
      return;
    }
    onConfirm(pinCode);
  };

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Confirm with PIN</div>
      <div style={{ fontSize: '14px', color: '#888', marginBottom: '24px' }}>
        Enter your 4-digit transaction PIN to authorize this transfer
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
        {pin.map((digit, i) => (
          <input
            key={i}
            id={`pin-${i}`}
            type="password"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            style={{
              width: '48px',
              height: '56px',
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: 600,
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              outline: 'none',
              background: '#fafafa',
            }}
          />
        ))}
      </div>

      {error && <div style={{ color: '#a32d2d', fontSize: '14px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          style={{ ...styles.confirmBtn, opacity: pin.join('').length === 4 ? 1 : 0.5 }}
          disabled={pin.join('').length !== 4 || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Verifying...' : 'Confirm Transfer'}
        </button>
        <button style={styles.cancelBtn} onClick={onCancel} disabled={loading}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const styles = {
  confirmBtn: {
    background: '#1a6b3c',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '16px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  cancelBtn: {
    background: '#fff',
    color: '#666',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
  },
};
