import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function Dashboard() {
  const { user, logout, fetchProfile } = useAuth();
  const [tab, setTab] = useState('send');
  const [providers, setProviders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ recipient: '', amount: '', note: '' });
  const [sending, setSending] = useState(false);
  const [lastTxn, setLastTxn] = useState(null);
  const [error, setError] = useState('');
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [newAccount, setNewAccount] = useState({ provider_id: '', account_number: '' });
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [notification, setNotification] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showSetPin, setShowSetPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [pinSetMsg, setPinSetMsg] = useState('');
  const [walletCards, setWalletCards] = useState([]);
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    client.get('/user/providers').then(r => setProviders(r.data.providers));
    client.get('/accounts').then(r => setLinkedAccounts(r.data.accounts));
    client.get('/wallets').then(r => {
      setWalletCards(r.data.wallets);
      setCycleIndex(0);
    }).catch(() => {});
    client.get('/transfer/history').then(r => {
      const txns = r.data.transactions;
      setTransactions(txns);
      checkForNewActivity(txns);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (walletCards.length <= 1) return;
    const timer = setInterval(() => {
      setCycleIndex(prev => (prev + 1) % walletCards.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [walletCards.length]);

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
    const res = await client.get('/accounts');
    setLinkedAccounts(res.data.accounts);
    client.get('/wallets').then(r => setWalletCards(r.data.wallets)).catch(() => {});
  };

  const handleLinkAccount = async () => {
    if (!newAccount.provider_id || !newAccount.account_number) return;
    setLinkingAccount(true);
    setLinkError('');
    try {
      await client.post('/accounts', newAccount);
      await fetchAccounts();
      setNewAccount({ provider_id: '', account_number: '' });
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not link account');
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleUnlinkAccount = async (id) => {
    await client.delete(`/accounts/${id}`);
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
      await client.post('/user/set-pin', { pin: newPin });
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

  const handleConfirmWithPin = async () => {
    if (pin.length !== 4) { setPinError('Enter your 4-digit PIN'); return; }
    setPinError('');
    setSending(true);
    try {
      const verifyRes = await client.post('/user/verify-pin', { pin });
      if (!verifyRes.data.success) {
        setPinError('Incorrect PIN');
        setSending(false);
        return;
      }
      await handleSend();
    } catch (err) {
      if (err.response?.data?.error === 'NO_PIN') {
        setShowSetPin(true);
        setPinError('You need to set a transaction PIN first');
      } else {
        setPinError('Incorrect PIN. Try again.');
      }
      setSending(false);
    }
  };

  function calculateFee(amount) {
    if (amount <= 50) return 1;
    if (amount <= 200) return 3;
    if (amount <= 500) return 7;
    if (amount <= 1000) return 12;
    return Math.round(amount * 0.01);
  }

  const fee = form.amount ? calculateFee(parseFloat(form.amount)) : 0;
  const total = form.amount ? parseFloat(form.amount) + fee : 0;

  const handleSend = async () => {
    setError('');
    setSending(true);
    try {
      const isLinkedTo = String(selectedTo.id).startsWith('linked-');
      const payload = {
        fromWalletId: selectedFrom.id,
        amount: parseFloat(form.amount),
        note: form.note,
      };
      if (isLinkedTo) {
        payload.toWalletId = selectedTo.id;
      } else {
        payload.toProvider = selectedTo.id;
        payload.toRecipient = form.recipient;
      }
      const res = await client.post('/wallets/transfers', payload);
      setLastTxn(res.data);
      await fetchProfile();
      client.get('/wallets').then(r => setWalletCards(r.data.wallets)).catch(() => {});
      const history = await client.get('/transfer/history');
      setTransactions(history.data.transactions);
      setPin('');
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const resetSend = () => {
    setSelectedFrom(null);
    setSelectedTo(null);
    setForm({ recipient: '', amount: '', note: '' });
    setStep(1);
    setLastTxn(null);
    setError('');
    setPin('');
    setPinError('');
    setShowSetPin(false);
  };

  return (
    <div style={s.page}>
      <div style={s.app}>

        {notification && (
          <div style={{ ...s.notificationBanner, background: notification.type === 'received' ? '#e6f7ed' : '#fff4e5', borderColor: notification.type === 'received' ? '#a8dfc0' : '#ffd699' }}>
            <span style={{ fontSize: '16px', marginRight: '8px' }}>{notification.type === 'received' ? '💰' : '↩️'}</span>
            <span style={{ flex: 1, fontSize: '13px', color: '#333' }}>{notification.text}</span>
            <button onClick={() => setNotification(null)} style={s.notificationClose}>✕</button>
          </div>
        )}

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

        <div style={s.balanceBar}>
          <div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>{walletCards[cycleIndex]?.walletName || 'Wallet'}</div>
            <div style={{ fontSize: '22px', fontWeight: 500 }}>NLe {walletCards[cycleIndex] ? Number(walletCards[cycleIndex].balance).toLocaleString() : '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Status</div>
            <div style={{ fontSize: '13px', color: '#7edeab' }}>● Verified</div>
          </div>
        </div>

        {walletCards.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '8px 0', background: 'white', borderBottom: '1px solid #eee' }}>
            {walletCards.map((w, i) => (
              <div key={w.id} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i === cycleIndex ? '#1a6b3c' : '#ddd', transition: 'background 0.3s' }} />
            ))}
          </div>
        )}

        <div style={s.tabs}>
          {['send', 'accounts', 'history', 'network'].map(t => (
            <div key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <div style={s.content}>

          {tab === 'send' && (
            <div>
              <div style={s.networkBadge}>● Network live — {providers.length} providers connected</div>
              <div style={s.stepBar}>
                {[1, 2, 3].map(n => (
                  <div key={n} style={{ ...s.stepDot, background: step > n ? '#1a6b3c' : step === n ? '#7edeab' : '#ddd' }} />
                ))}
              </div>

              {error && <div style={s.errorBox}>{error}</div>}

              {step === 1 && (
                <>
                  <div style={s.sectionTitle}>From</div>
                  <div style={s.providerGrid}>
                    {walletCards.map(w => {
                      const provider = providers.find(p => p.id === w.provider);
                      const isSimplePay = w.provider === 'SimplePay';
                      return (
                        <div 
                          key={w.id} 
                          style={{ 
                            ...s.providerCard, 
                            ...(selectedFrom?.id === w.id ? s.providerSelected : {})
                          }} 
                          onClick={() => setSelectedFrom({ 
                            id: w.id, 
                            name: w.walletName || w.provider,
                            short: isSimplePay ? 'SP' : provider?.short || '??',
                            color: isSimplePay ? '#1a6b3c' : provider?.color || '#888',
                            type: isSimplePay ? 'wallet' : 'linked',
                            balance: w.balance
                          })}
                        >
                          <div style={{ ...s.providerIcon, background: isSimplePay ? '#1a6b3c' : provider?.color }}>{isSimplePay ? 'SP' : provider?.short}</div>
                          <div style={s.providerName}>{w.walletName || w.provider}</div>
                          <div style={s.providerType}>{isSimplePay ? 'Wallet' : 'Linked · NLe ' + Number(w.balance).toLocaleString()}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={s.divider}>↓ to</div>
                  <div style={s.sectionTitle}>To</div>
                  <div style={s.providerGrid}>
                    {walletCards.filter(w => w.provider !== 'SimplePay').map(w => {
                      const provider = providers.find(p => p.id === w.provider);
                      return (
                        <div 
                          key={w.id} 
                          style={{ 
                            ...s.providerCard, 
                            ...(selectedTo?.id === w.id ? s.providerSelected : {})
                          }} 
                          onClick={() => setSelectedTo({ 
                            id: w.id, 
                            name: w.walletName || w.provider,
                            short: provider?.short || '??',
                            color: provider?.color || '#888',
                            type: 'linked',
                            balance: w.balance
                          })}
                        >
                          <div style={{ ...s.providerIcon, background: provider?.color || '#888' }}>{provider?.short || '??'}</div>
                          <div style={s.providerName}>{w.walletName || w.provider}</div>
                          <div style={s.providerType}>Linked</div>
                        </div>
                      );
                    })}
                    {providers.map(p => (
                      <div 
                        key={p.id} 
                        style={{ 
                          ...s.providerCard, 
                          ...(selectedTo?.id === p.id ? s.providerSelected : {})
                        }} 
                        onClick={() => setSelectedTo({ 
                          id: p.id, 
                          name: p.name,
                          short: p.short,
                          color: p.color,
                          type: p.type
                        })}
                      >
                        <div style={{ ...s.providerIcon, background: p.color }}>{p.short}</div>
                        <div style={s.providerName}>{p.name}</div>
                        <div style={s.providerType}>{p.type.replace('_', ' ')}</div>
                      </div>
                    ))}
                  </div>
                  <button style={{ ...s.btn, opacity: selectedFrom && selectedTo ? 1 : 0.5 }} disabled={!selectedFrom || !selectedTo || selectedFrom.id === selectedTo.id} onClick={() => setStep(2)}>
                    Continue →
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
                    <strong>{selectedFrom?.name}</strong> → <strong>{selectedTo?.name}</strong>
                  </div>
                  {!String(selectedTo.id).startsWith('linked-') && (
                    <>
                      <label style={s.label}>{selectedTo?.id === 'simplepay' ? 'Recipient SimplePay Account Number' : 'Recipient phone / account number'}</label>
                      <input style={s.input} placeholder={selectedTo?.id === 'simplepay' ? 'SP-12345678' : '077 123 456'} value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} />
                    </>
                  )}
                  {String(selectedTo.id).startsWith('linked-') && (
                    <div style={{ background: '#e6f7ed', border: '1px solid #a8dfc0', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#1a6b3c' }}>
                      Sending to linked {selectedTo.name} ({selectedTo.balance ? 'NLe ' + Number(selectedTo.balance).toLocaleString() : 'NLe 0'} balance)
                    </div>
                  )}
                  <label style={s.label}>Amount (NLe)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={s.currencyBadge}>NLe</span>
                    <input style={{ ...s.input, flex: 1 }} type="number" placeholder="50" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    Fee: NLe {fee.toLocaleString()} · Total: NLe {total.toLocaleString()}
                  </div>
                  <label style={s.label}>Note (optional)</label>
                  <input style={s.input} placeholder="e.g. School fees" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                  <button style={{ ...s.btn, opacity: form.amount ? 1 : 0.5 }} disabled={!form.amount} onClick={() => setStep(3)}>
                    Review transfer →
                  </button>
                  <button style={s.backBtn} onClick={() => setStep(1)}>← Back</button>
                </>
              )}

              {step === 3 && (
                <>
                  <div style={s.sectionTitle}>Confirm transfer</div>
                  <div style={s.receiptCard}>
                    {[
                      ['From', selectedFrom?.name],
                      ['To', selectedTo?.name],
                      ['Recipient', form.recipient],
                      ['Amount', `NLe ${Number(form.amount).toLocaleString()}`],
                      ['Fee', `NLe ${fee.toLocaleString()}`],
                      ['Total deducted', `NLe ${total.toLocaleString()}`],
                      ...(form.note ? [['Note', form.note]] : []),
                    ].map(([k, v]) => (
                      <div key={k} style={s.receiptRow}>
                        <span style={{ color: '#888' }}>{k}</span>
                        <span style={{ fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>

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
                      <button style={s.backBtn} onClick={() => setShowSetPin(false)}>← Back</button>
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
                      {pinError && <div style={s.errorBox}>{pinError}</div>}
                      <button style={{ ...s.btn, opacity: pin.length === 4 ? 1 : 0.5 }} disabled={pin.length !== 4 || sending} onClick={handleConfirmWithPin}>
                        {sending ? 'Processing...' : 'Confirm & send 🔒'}
                      </button>
                      <div style={{ textAlign: 'center', marginTop: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#888', cursor: 'pointer' }} onClick={() => setShowSetPin(true)}>
                          Forgot PIN? Set a new one
                        </span>
                      </div>
                    </div>
                  )}

                  <button style={s.backBtn} onClick={() => setStep(2)}>← Back</button>
                </>
              )}

              {step === 4 && lastTxn && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={s.successIcon}>✓</div>
                  <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Transfer successful!</div>
                  <div style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
                    NLe {Number(lastTxn.amount).toLocaleString()} sent from {selectedFrom?.name} to {selectedTo?.name}
                  </div>
                  <div style={s.receiptCard}>
                    {[
                      ['Reference', lastTxn.reference],
                      ['Amount sent', `NLe ${Number(lastTxn.amount).toLocaleString()}`],
                      ['Total charged', `NLe ${Number(lastTxn.total_deducted).toLocaleString()}`],
                      ['New balance', `NLe ${Number(lastTxn.new_balance).toLocaleString()}`],
                      ['Status', '✓ Completed'],
                    ].map(([k, v]) => (
                      <div key={k} style={s.receiptRow}>
                        <span style={{ color: '#888' }}>{k}</span>
                        <span style={{ fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button style={s.btn} onClick={resetSend}>Send another transfer</button>
                </div>
              )}
            </div>
          )}

          {tab === 'accounts' && (
            <div>
              <div style={s.sectionTitle}>Link a new account</div>
              {linkError && <div style={s.errorBox}>{linkError}</div>}
              <label style={s.label}>Provider</label>
              <select style={s.input} value={newAccount.provider_id} onChange={e => setNewAccount({ ...newAccount, provider_id: e.target.value })}>
                <option value="">Select a provider</option>
                {providers.map(p => (
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
                  <div key={acc.id} style={s.txnItem}>
                    <div style={{ ...s.txnIcon, background: p?.color || '#1a6b3c' }}>{p?.short || '??'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{p?.name || acc.provider_id}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{acc.account_number} · ✓ Verified</div>
                    </div>
                    <button onClick={() => handleUnlinkAccount(acc.id)} style={{ background: 'none', border: 'none', color: '#a32d2d', fontSize: '13px', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                );
              })}

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Your SimplePay Account</div>
              {user?.simplepay_account_number && (
                <div style={{ background: '#e6f7ed', border: '1px solid #a8dfc0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>Your SimplePay account number</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: '#1a6b3c', letterSpacing: '1px' }}>{user.simplepay_account_number}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Share this to receive money</div>
                  </div>
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
                      {isReversed ? '↩' : isReceived ? '↓' : t.to_provider.slice(0, 2).toUpperCase()}
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
                    <div style={{ fontSize: '22px', fontWeight: 500 }}>{val}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={s.sectionTitle}>Connected providers</div>
              <div style={s.providerGrid}>
                {providers.map(p => (
                  <div key={p.id} style={s.providerCard}>
                    <div style={{ ...s.providerIcon, background: p.color }}>{p.short}</div>
                    <div style={s.providerName}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: '#1a6b3c' }}>● Active</div>
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
  page: { minHeight: '100vh', background: '#f0f0f0', display: 'flex', justifyContent: 'center', padding: '20px 10px' },
  app: { width: '100%', maxWidth: '680px' },
  header: { background: '#1a6b3c', color: 'white', padding: '16px 20px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: '20px', fontWeight: 600, color: 'white' },
  headerSub: { fontSize: '12px', opacity: 0.7, marginTop: '2px' },
  logoutBtn: { fontSize: '11px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', marginTop: '4px' },
  balanceBar: { background: '#145c32', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tabs: { display: 'flex', background: 'white', borderBottom: '1px solid #eee' },
  tab: { flex: 1, padding: '12px 8px', textAlign: 'center', fontSize: '13px', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent' },
  tabActive: { color: '#1a6b3c', borderBottomColor: '#1a6b3c', fontWeight: 500 },
  content: { background: 'white', borderRadius: '0 0 12px 12px', padding: '20px', border: '1px solid #eee', borderTop: 'none' },
  networkBadge: { display: 'inline-block', background: '#e6f7ed', color: '#1a6b3c', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', marginBottom: '12px' },
  stepBar: { display: 'flex', gap: '6px', marginBottom: '20px' },
  stepDot: { flex: 1, height: '3px', borderRadius: '2px' },
  sectionTitle: { fontSize: '11px', fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' },
  providerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' },
  providerCard: { border: '1.5px solid #eee', borderRadius: '8px', padding: '10px 8px', textAlign: 'center', cursor: 'pointer', background: 'white' },
  providerSelected: { borderColor: '#1a6b3c', background: '#e6f7ed' },
  providerIcon: { width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: 'white' },
  providerName: { fontSize: '11px', fontWeight: 500, lineHeight: 1.3 },
  providerType: { fontSize: '10px', color: '#888', marginTop: '2px' },
  divider: { textAlign: 'center', color: '#888', fontSize: '13px', margin: '8px 0 16px' },
  label: { display: 'block', fontSize: '13px', color: '#555', margin: '12px 0 6px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' },
  currencyBadge: { background: '#e6f7ed', color: '#1a6b3c', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid #a8dfc0', whiteSpace: 'nowrap' },
  btn: { width: '100%', padding: '13px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', marginTop: '12px' },
  backBtn: { width: '100%', padding: '11px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', marginTop: '8px' },
  receiptCard: { background: '#f8f8f8', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' },
  receiptRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid #eee' },
  txnItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px' },
  txnIcon: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white', flexShrink: 0 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' },
  statCard: { background: '#f8f8f8', borderRadius: '8px', padding: '12px' },
  successIcon: { width: '60px', height: '60px', borderRadius: '50%', background: '#e6f7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px', color: '#1a6b3c' },
  errorBox: { background: '#fde8e8', color: '#a32d2d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px', marginTop: '8px' },
  notificationBanner: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', border: '1px solid', marginBottom: '12px' },
  notificationClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '14px', padding: '0 4px' },
  pinBox: { background: '#f8f8f8', borderRadius: '10px', padding: '16px', marginBottom: '12px', textAlign: 'center' },
  pinTitle: { fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' },
};