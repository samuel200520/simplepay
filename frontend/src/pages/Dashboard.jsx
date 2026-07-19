import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import WalletCarousel from '../components/WalletCarousel';
import TransferForm from '../components/TransferForm';
import * as WalletService from '../services/WalletService';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('send');
  const [wallets, setWallets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);

  // Link account form
  const [newAccount, setNewAccount] = useState({ provider_id: '', account_number: '' });
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [linkError, setLinkError] = useState('');

  // PIN management
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showSetPin, setShowSetPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [pinSetMsg, setPinSetMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        WalletService.fetchWallets(),
        WalletService.fetchProviders(),
      ]);
      setWallets(w);
      setProviders(p);
    } catch (err) {
      console.error('loadData error:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    WalletService.fetchTransactions().then(txns => {
      setTransactions(txns);
      checkForNewActivity(txns);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  const checkForNewActivity = (txns) => {
    const lastSeen = localStorage.getItem('simplepay_last_seen_txn');
    if (!txns.length) return;
    const mostRecent = txns[0];
    if (lastSeen === mostRecent.reference) return;
    if (mostRecent.direction === 'received') {
      setNotification({ type: 'received', text: `You received NLe ${Number(mostRecent.amount).toLocaleString()} from ${mostRecent.receiver_identifier}` });
    } else if (mostRecent.status === 'reversed') {
      setNotification({ type: 'reversed', text: `Your transfer of NLe ${Number(mostRecent.amount).toLocaleString()} was reversed and refunded` });
    }
    localStorage.setItem('simplepay_last_seen_txn', mostRecent.reference);
  };

  const fetchAccounts = async () => {
    try {
      const { default: client } = await import('../api/client');
      const res = await client.get('/accounts');
      setLinkedAccounts(res.data.accounts);
      const w = await WalletService.fetchWallets();
      setWallets(w);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLinkAccount = async () => {
    if (!newAccount.provider_id || !newAccount.account_number) return;
    setLinkingAccount(true);
    setLinkError('');
    try {
      await WalletService.linkAccount(newAccount.provider_id, newAccount.account_number);
      await fetchAccounts();
      setNewAccount({ provider_id: '', account_number: '' });
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not link account');
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleUnlinkAccount = async (id) => {
    await WalletService.unlinkAccount(id);
    await fetchAccounts();
  };

  const handleSetPin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinSetMsg('PIN must be exactly 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinSetMsg('PINs do not match');
      return;
    }
    setSettingPin(true);
    setPinSetMsg('');
    try {
      await WalletService.setPin(newPin);
      setPinSetMsg('PIN set successfully!');
      setShowSetPin(false);
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setPinSetMsg(err.response?.data?.error || 'Could not set PIN');
    } finally {
      setSettingPin(false);
    }
  };

  const handleSend = async (payload) => {
    setError('');
    setSending(true);
    try {
      // First verify PIN
      if (!pin && !showSetPin) {
        const verifyRes = await WalletService.verifyPin(pin);
        if (!verifyRes.success) {
          setPinError('Incorrect PIN');
          setSending(false);
          return;
        }
      }
      const result = await WalletService.transferBetweenWallets(payload);
      // Refresh wallets
      const w = await WalletService.fetchWallets();
      setWallets(w);
      const txns = await WalletService.fetchTransactions();
      setTransactions(txns);
      setPin('');
      return result;
    } catch (err) {
      if (err.response?.data?.error === 'NO_PIN') {
        setShowSetPin(true);
        setPinError('You need to set a transaction PIN first');
      } else {
        setError(err.response?.data?.error || 'Transfer failed');
      }
      throw err;
    } finally {
      setSending(false);
    }
  };

  const resetSend = () => {
    setError('');
    setPin('');
    setPinError('');
    setShowSetPin(false);
  };

  return (
    <div style={s.page}>
      <div style={s.app}>
        {/* Notification banner */}
        {notification && (
          <div style={{ ...s.notificationBanner, background: notification.type === 'received' ? '#e6f7ed' : '#fff4e5', borderColor: notification.type === 'received' ? '#a8dfc0' : '#ffd699' }}>
            <span style={{ fontSize: '16px', marginRight: '8px' }}>{notification.type === 'received' ? '💰' : '↩️'}</span>
            <span style={{ flex: 1, fontSize: '13px', color: '#333' }}>{notification.text}</span>
            <button onClick={() => setNotification(null)} style={s.notificationClose}>✕</button>
          </div>
        )}

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.logo}>Simple<span style={{ color: '#7edeab' }}>Pay</span></div>
            <div style={s.headerSub}>Unified Payments · Sierra Leone</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Welcome back</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{user?.full_name?.split(' ')[0]} {user?.full_name?.split(' ')[1]?.[0]}.</div>
            {user?.simplepay_account_number && (
              <div style={{ fontSize: '11px', color: '#7edeab', marginTop: '2px' }}>Account: {user.simplepay_account_number}</div>
            )}
            <button onClick={logout} style={s.logoutBtn}>Sign out</button>
          </div>
        </div>

        {/* Wallet Carousel — replaces old balance bar */}
        <div style={s.carouselSection}>
          <WalletCarousel wallets={wallets} />
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {['send', 'accounts', 'history', 'network'].map(t => (
            <div key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => { setTab(t); resetSend(); }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <div style={s.content}>
          {/* Error */}
          {error && <div style={s.errorBox}>{error}</div>}

          {/* Send Tab */}
          {tab === 'send' && (
            <div>
              <div style={s.networkBadge}>● Network live — {providers.length} providers connected</div>
              <TransferForm
                wallets={wallets}
                providers={providers}
                onSend={handleSend}
                sending={sending}
              />

              {/* PIN entry (simplified) */}
              {pinError && <div style={s.errorBox}>{pinError}</div>}

              {showSetPin ? (
                <div style={s.pinBox}>
                  <div style={s.pinTitle}>🔐 Set a Transaction PIN</div>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
                    You need a 4-digit PIN to confirm transfers
                  </div>
                  <label style={s.label}>New PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <label style={s.label}>Confirm PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  {pinSetMsg && <div style={{ ...s.errorBox, marginTop: '8px', background: pinSetMsg.includes('success') ? '#e6f7ed' : '#fde8e8', color: pinSetMsg.includes('success') ? '#1a6b3c' : '#a32d2d' }}>{pinSetMsg}</div>}
                  <button style={{ ...s.btn, opacity: newPin.length === 4 && confirmPin.length === 4 ? 1 : 0.5 }} disabled={newPin.length !== 4 || confirmPin.length !== 4 || settingPin} onClick={handleSetPin}>
                    {settingPin ? 'Setting PIN...' : 'Set PIN & continue'}
                  </button>
                </div>
              ) : (
                <div style={s.pinBox}>
                  <div style={s.pinTitle}>🔐 Enter Transaction PIN</div>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px', textAlign: 'center' }}>
                    Enter your 4-digit PIN to authorize this transfer
                  </div>
                  <input
                    style={{ ...s.input, letterSpacing: '12px', fontSize: '24px', textAlign: 'center', fontWeight: 600 }}
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
                  />
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#888', cursor: 'pointer' }} onClick={() => setShowSetPin(true)}>
                      Forgot PIN? Set a new one
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Accounts Tab */}
          {tab === 'accounts' && (
            <div>
              <div style={s.sectionTitle}>Link a new account</div>
              {linkError && <div style={s.errorBox}>{linkError}</div>}
              <label style={s.label}>Provider</label>
              <select style={s.input} value={newAccount.provider_id} onChange={e => setNewAccount({ ...newAccount, provider_id: e.target.value })}>
                <option value="">Select a provider</option>
                {providers.filter(p => p.id !== 'simplepay').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label style={s.label}>Account / phone number</label>
              <input style={s.input} placeholder="e.g. 077 123 456" value={newAccount.account_number} onChange={e => setNewAccount({ ...newAccount, account_number: e.target.value })} />
              <button style={{ ...s.btn, opacity: newAccount.provider_id && newAccount.account_number ? 1 : 0.5 }} disabled={!newAccount.provider_id || !newAccount.account_number || linkingAccount} onClick={handleLinkAccount}>
                {linkingAccount ? 'Linking...' : 'Link account'}
              </button>

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Your linked accounts</div>
              {linkedAccounts.length === 0 && <p style={{ color: '#888', fontSize: '14px' }}>No accounts linked yet.</p>}
              {linkedAccounts.map(acc => {
                const p = providers.find(pr => pr.id === acc.provider_id);
                return (
                  <div key={acc.id} style={s.linkedItem}>
                    <div style={{ ...s.linkedIcon, background: p?.color || '#555' }}>{p?.short || '??'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{p?.name || acc.provider_id}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{acc.account_number} · ✓ Verified</div>
                    </div>
                    <button onClick={() => handleUnlinkAccount(acc.id)} style={s.removeBtn}>Remove</button>
                  </div>
                );
              })}

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Your SimplePay Account</div>
              {user?.simplepay_account_number && (
                <div style={s.accountBox}>
                  <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>Your SimplePay account number</div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#1a6b3c', letterSpacing: '1px' }}>{user.simplepay_account_number}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Share this to receive money</div>
                </div>
              )}

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Transaction PIN</div>
              {pinSetMsg && <div style={{ ...s.errorBox, background: pinSetMsg.includes('success') ? '#e6f7ed' : '#fde8e8', color: pinSetMsg.includes('success') ? '#1a6b3c' : '#a32d2d' }}>{pinSetMsg}</div>}
              <label style={s.label}>New PIN</label>
              <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <label style={s.label}>Confirm PIN</label>
              <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <button style={{ ...s.btn, opacity: newPin.length === 4 && confirmPin.length === 4 ? 1 : 0.5 }} disabled={newPin.length !== 4 || confirmPin.length !== 4 || settingPin} onClick={handleSetPin}>
                {settingPin ? 'Setting PIN...' : 'Set Transaction PIN'}
              </button>
            </div>
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <div>
              <div style={s.sectionTitle}>Recent transactions</div>
              {transactions.length === 0 && <p style={{ color: '#888', fontSize: '14px' }}>No transactions yet.</p>}
              {transactions.map(t => {
                const isReceived = t.direction === 'received';
                const isReversed = t.status === 'reversed';
                return (
                  <div key={t.id} style={{ ...s.txnItem, opacity: isReversed ? 0.6 : 1 }}>
                    <div style={{ ...s.txnIcon, background: isReversed ? '#888' : isReceived ? '#1a6b3c' : '#888' }}>
                      {isReversed ? '↩' : isReceived ? '↓' : t.to_provider?.slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>
                        {isReceived ? `From ${t.receiver_identifier}` : t.receiver_identifier}
                        {isReversed && <span style={{ color: '#a32d2d', fontSize: '11px', marginLeft: '8px' }}>· Reversed</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {isReceived ? `Received via ${t.to_provider}` : `${t.from_provider} → ${t.to_provider}`} · {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ color: isReversed ? '#888' : isReceived ? '#1a6b3c' : '#a32d2d', fontWeight: 500, fontSize: '14px', textDecoration: isReversed ? 'line-through' : 'none' }}>
                      {isReceived ? '+' : '-'}NLe {Number(t.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Network Tab */}
          {tab === 'network' && (
            <div>
              <div style={s.networkBadge}>● Live network</div>
              <div style={s.statGrid}>
                {[
                  ['Active providers', providers.length, 'Banks + MNOs'],
                  ['Avg settlement', '1.8s', 'Real-time rails'],
                ].map(([label, val, sub]) => (
                  <div key={label} style={s.statCard}>
                    <div style={{ fontSize: '11px', color: '#888' }}>{label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 500, color: '#1a1a1a' }}>{val}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={s.sectionTitle}>Connected providers</div>
              <div style={s.providerGrid}>
                {providers.map(p => (
                  <div key={p.id} style={s.netCard}>
                    <div style={{ ...s.netIcon, background: p.color }}>{p.short}</div>
                    <div style={{ fontSize: '11px', fontWeight: 500, marginTop: '6px' }}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: '#1a6b3c', marginTop: '2px' }}>● Active</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#0f0f0f', display: 'flex', justifyContent: 'center', padding: '20px 10px' },
  app: { width: '100%', maxWidth: '720px' },
  header: { background: '#1a1a1a', color: 'white', padding: '16px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' },
  logo: { fontSize: '20px', fontWeight: 600, color: 'white' },
  headerSub: { fontSize: '12px', opacity: 0.7, marginTop: '2px' },
  logoutBtn: { fontSize: '11px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', marginTop: '4px' },
  carouselSection: {
    background: '#1a1a1a',
    padding: '16px 0',
    borderBottom: '1px solid #333',
  },
  tabs: { display: 'flex', background: '#1a1a1a', borderBottom: '1px solid #333' },
  tab: { flex: 1, padding: '12px 8px', textAlign: 'center', fontSize: '13px', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent' },
  tabActive: { color: '#7edeab', borderBottomColor: '#7edeab', fontWeight: 500 },
  content: { background: '#1a1a1a', borderRadius: '0 0 16px 16px', padding: '20px', border: '1px solid #333', borderTop: 'none', color: 'white' },
  networkBadge: { display: 'inline-block', background: '#e6f7ed', color: '#1a6b3c', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', marginBottom: '12px' },
  sectionTitle: { fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' },
  label: { display: 'block', fontSize: '13px', color: '#aaa', margin: '12px 0 6px' },
  input: { width: '100%', padding: '10px 12px', border: '2px solid #333', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', background: '#2a2a2a', color: 'white', outline: 'none' },
  btn: { width: '100%', padding: '13px', background: '#1a6b3c', color: 'white', border: '2px solid #0d4a28', borderRadius: '10px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', marginTop: '12px' },
  errorBox: { background: '#3a1a1a', color: '#ff6b6b', padding: '10px 12px', borderRadius: '10px', fontSize: '13px', marginBottom: '12px', border: '1px solid #5a2020' },
  notificationBanner: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '16px', border: '1px solid', marginBottom: '12px' },
  notificationClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '14px', padding: '0 4px' },
  linkedItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #333', borderRadius: '10px', marginBottom: '8px' },
  linkedIcon: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white', flexShrink: 0 },
  removeBtn: { background: 'none', border: 'none', color: '#ff6b6b', fontSize: '13px', cursor: 'pointer' },
  accountBox: { background: '#0d2a1a', border: '1px solid #1a6b3c', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' },
  statCard: { background: '#2a2a2a', borderRadius: '10px', padding: '12px', border: '1px solid #333' },
  providerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  netCard: { background: '#2a2a2a', border: '1px solid #333', borderRadius: '10px', padding: '12px 8px', textAlign: 'center' },
  netIcon: { width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: 'white' },
  txnItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #333', borderRadius: '10px', marginBottom: '8px' },
  txnIcon: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white', flexShrink: 0 },
  pinBox: { background: '#2a2a2a', borderRadius: '10px', padding: '16px', marginBottom: '12px', textAlign: 'center', border: '1px solid #333' },
  pinTitle: { fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '8px' },
};
