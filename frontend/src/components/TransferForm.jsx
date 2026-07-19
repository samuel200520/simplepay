import React, { useState } from 'react';

/**
 * TransferForm — FROM/TO dropdowns + amount + send.
 *
 * Props:
 *   wallets       array — user's wallets (SimplePay + linked)
 *   providers     array — all available providers
 *   onSend        (payload) => Promise — called on send
 *   fee           number — calculated fee (display only)
 *
 * The FROM dropdown lists every wallet the user owns.
 * The TO dropdown lists every available provider.
 *
 * Future: when real API integration happens, the onSend handler
 * calls the actual transfer endpoint. The form stays unchanged.
 */
export default function TransferForm({ wallets, providers, onSend, sending }) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState(null);

  const selectedFrom = wallets.find(w => w.id === fromId);
  const selectedTo = providers.find(p => p.id === toId);
  const numAmount = parseFloat(amount) || 0;

  function calculateFee(a) {
    if (a <= 50) return 1;
    if (a <= 200) return 3;
    if (a <= 500) return 7;
    if (a <= 1000) return 12;
    return Math.round(a * 0.01);
  }

  const fee = calculateFee(numAmount);
  const total = numAmount + fee;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fromId || !toId || !amount || numAmount < 5) return;

    const payload = {
      fromWalletId: fromId,
      amount: numAmount,
    };

    // If TO is a linked wallet (starts with linked-), use toWalletId
    // Otherwise use toProvider
    if (String(toId).startsWith('linked-')) {
      payload.toWalletId = toId;
    } else {
      payload.toProvider = toId;
      payload.toRecipient = toId === 'simplepay' ? (prompt('Recipient SimplePay account number:') || '') : (prompt('Recipient phone / account number:') || '');
    }

    try {
      const result = await onSend(payload);
      setSuccess({ from: selectedFrom?.walletName, to: selectedTo?.name, amount: numAmount, ...result });
      setFromId('');
      setToId('');
      setAmount('');
    } catch (err) {
      // error handled by parent
    }
  };

  if (success) {
    return (
      <div style={styles.successWrap}>
        <div style={styles.successIcon}>✓</div>
        <div style={styles.successTitle}>Transfer successful!</div>
        <div style={styles.successSub}>
          NLe {Number(success.amount).toLocaleString()} sent from {success.from} to {success.to}
        </div>
        <div style={styles.receipt}>
          {[
            ['Reference', success.reference],
            ['Amount', `NLe ${Number(success.amount).toLocaleString()}`],
            ['Fee', `NLe ${Number(success.fee || 0).toLocaleString()}`],
            ['Total deducted', `NLe ${Number(success.total_deducted).toLocaleString()}`],
            ['New balance', `NLe ${Number(success.new_balance).toLocaleString()}`],
          ].map(([k, v]) => (
            <div key={k} style={styles.receiptRow}>
              <span style={{ color: '#888' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <button style={styles.btn} onClick={() => setSuccess(null)}>Send another transfer</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* FROM dropdown */}
      <label style={styles.label}>FROM</label>
      <select style={styles.select} value={fromId} onChange={e => setFromId(e.target.value)} required>
        <option value="">Select source wallet</option>
        {wallets.map(w => (
          <option key={w.id} value={w.id}>
            {w.walletName} — NLe {Number(w.balance).toLocaleString()}
          </option>
        ))}
      </select>

      {/* TO dropdown */}
      <label style={styles.label}>TO</label>
      <select style={styles.select} value={toId} onChange={e => setToId(e.target.value)} required>
        <option value="">Select destination</option>
        {providers.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Amount */}
      <label style={styles.label}>Amount (NLe)</label>
      <div style={styles.amountRow}>
        <span style={styles.currencyBadge}>NLe</span>
        <input
          style={styles.input}
          type="number"
          min="5"
          step="1"
          placeholder="50"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          required
        />
      </div>
      {numAmount >= 5 && (
        <div style={styles.feeText}>
          Fee: NLe {fee.toLocaleString()} · Total: NLe {total.toLocaleString()}
        </div>
      )}

      {/* Send button */}
      <button
        type="submit"
        style={{
          ...styles.btn,
          opacity: fromId && toId && numAmount >= 5 ? 1 : 0.5,
          marginTop: '16px',
        }}
        disabled={!fromId || !toId || numAmount < 5 || sending}
      >
        {sending ? 'Processing...' : 'Send'}
      </button>
    </form>
  );
}

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
    marginTop: '14px',
  },
  select: {
    padding: '12px',
    border: '2px solid #222',
    borderRadius: '10px',
    fontSize: '15px',
    background: 'white',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  input: {
    flex: 1,
    padding: '12px',
    border: '2px solid #222',
    borderRadius: '10px',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  amountRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  currencyBadge: {
    background: '#e6f7ed',
    color: '#1a6b3c',
    padding: '12px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    border: '2px solid #1a6b3c',
    whiteSpace: 'nowrap',
  },
  feeText: {
    fontSize: '12px',
    color: '#888',
    marginTop: '6px',
  },
  btn: {
    width: '100%',
    padding: '14px',
    background: '#1a6b3c',
    color: 'white',
    border: '2px solid #0d4a28',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  successWrap: {
    textAlign: 'center',
    padding: '20px 0',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#e6f7ed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    fontSize: '30px',
    color: '#1a6b3c',
    border: '2px solid #a8dfc0',
  },
  successTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#1a1a1a',
  },
  successSub: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '20px',
  },
  receipt: {
    background: '#f8f8f8',
    borderRadius: '10px',
    padding: '14px 16px',
    marginBottom: '16px',
    textAlign: 'left',
    border: '1px solid #eee',
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    padding: '6px 0',
    borderBottom: '1px solid #eee',
  },
};
