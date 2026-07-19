import React from 'react';

/**
 * WalletCard — bank-card-style display for a single wallet.
 *
 * Props:
 *   wallet  { id, provider, walletName, balance, currency, status }
 *   active  boolean (used for visual emphasis)
 *
 * Future: when real provider APIs are integrated, `balance` comes
 * from the API and this component renders it unchanged.
 */
const providerColors = {
  SimplePay: '#1a6b3c',
  orange: '#ff6600',
  africell: '#e4003a',
  qmoney: '#8a2be2',
  rokel: '#1a6b3c',
  slcb: '#003580',
  gtbank: '#f37021',
  ecobank: '#003087',
  union: '#5c1a8a',
  access: '#c8102e',
  bsl: '#1a4080',
  uba: '#e4003a',
};

const providerShort = {
  SimplePay: 'SP',
  orange: 'OM',
  africell: 'AM',
  qmoney: 'QM',
  rokel: 'RCB',
  slcb: 'SLC',
  gtbank: 'GTB',
  ecobank: 'ECO',
  union: 'UTB',
  access: 'ACC',
  bsl: 'BSL',
  uba: 'UBA',
};

export default function WalletCard({ wallet, active }) {
  const color = providerColors[wallet.provider] || '#555';
  const short = providerShort[wallet.provider] || wallet.provider.slice(0, 3).toUpperCase();
  const isActive = wallet.status === 'Active';
  const isLinked = wallet.status === 'Linked';

  const cardStyle = {
    ...styles.card,
    borderColor: active ? color : '#222',
    boxShadow: active ? `0 0 0 2px ${color}` : '0 2px 12px rgba(0,0,0,0.15)',
  };

  return (
    <div style={cardStyle}>
      {/* Card background gradient overlay */}
      <div style={{ ...styles.cardBg, background: `linear-gradient(135deg, ${color} 0%, ${darken(color, 40)} 100%)` }} />

      {/* Chip + provider badge */}
      <div style={styles.topRow}>
        <div style={styles.chip}>
          <div style={styles.chipInner} />
        </div>
        <div style={{ ...styles.providerBadge, background: 'rgba(255,255,255,0.2)' }}>
          {short}
        </div>
      </div>

      {/* Wallet name */}
      <div style={styles.walletName}>{wallet.walletName}</div>

      {/* Balance */}
      <div style={styles.balanceRow}>
        <span style={styles.currency}>{wallet.currency || 'SLE'}</span>
        <span style={styles.balance}>{Number(wallet.balance).toLocaleString()}</span>
      </div>

      {/* Status */}
      <div style={styles.statusRow}>
        <span style={{
          ...styles.statusDot,
          background: isActive ? '#7edeab' : isLinked ? '#ffd699' : '#ccc',
        }} />
        <span style={styles.statusText}>
          {isActive ? 'Active' : isLinked ? 'Linked' : wallet.status}
        </span>
      </div>

      {/* Pattern dots */}
      <div style={styles.patternOverlay}>
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', margin: 2 }} />
        ))}
      </div>
    </div>
  );
}

function darken(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
  return `rgb(${r},${g},${b})`;
}

const styles = {
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: '320px',
    height: '190px',
    borderRadius: '16px',
    padding: '20px',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    overflow: 'hidden',
    border: '2px solid #222',
    boxSizing: 'border-box',
    flexShrink: 0,
    margin: '0 auto',
  },
  cardBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  chip: {
    width: '36px',
    height: '26px',
    background: '#ffd700',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInner: {
    width: '24px',
    height: '16px',
    border: '1.5px solid #b8960f',
    borderRadius: '2px',
  },
  providerBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    backdropFilter: 'blur(4px)',
  },
  walletName: {
    fontSize: '14px',
    fontWeight: 500,
    position: 'relative',
    zIndex: 1,
    opacity: 0.9,
    marginTop: '4px',
  },
  balanceRow: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    marginTop: '8px',
  },
  currency: {
    fontSize: '14px',
    fontWeight: 600,
    opacity: 0.8,
  },
  balance: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '1px',
  },
  statusRow: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    fontSize: '11px',
    opacity: 0.85,
    fontWeight: 500,
  },
  patternOverlay: {
    position: 'absolute',
    bottom: '10px',
    right: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    width: '48px',
    zIndex: 0,
  },
};
