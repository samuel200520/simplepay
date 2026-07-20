import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import WalletCarousel from '../components/WalletCarousel';
import TransactionPin from '../components/TransactionPin';
import client from '../api/client';
import { calculateTransactionFee } from '../utils/feeCalculator';

export default function Dashboard() {
  const { user, logout, fetchProfile } = useAuth();
  const [tab, setTab] = useState('send');
  const [providers, setProviders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [walletCards, setWalletCards] = useState([]);
  const [lastTxn, setLastTxn] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notification, setNotification] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [selectedToId, setSelectedToId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferStep, setTransferStep] = useState('form');
  const [transferPayload, setTransferPayload] = useState(null);

  // Link account form
  const [newAccount, setNewAccount] = useState({ provider_id: '', account_number: '' });
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [linkError, setLinkError] = useState('');

  // PIN prompt after linking account
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinPromptPin, setPinPromptPin] = useState('');
  const [pinPromptConfirm, setPinPromptConfirm] = useState('');
  const [pinPromptMsg, setPinPromptMsg] = useState('');
  const [settingPinPrompt, setSettingPinPrompt] = useState(false);

  // PIN management
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [pinSetMsg, setPinSetMsg] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinMode, setPinMode] = useState('set'); // 'set' | 'change'

  useEffect(() => {
    // Load all data on mount — each independently so one failure doesn't block others
    const loadData = async () => {
      setLoadError('');
      try {
        const pRes = await client.get('/user/providers');
        setProviders(pRes.data.providers);
      } catch (err) {
        console.error('load providers error:', err);
        setLoadError('Failed to load providers');
      }

      try {
        const wRes = await client.get('/wallets');
        setWalletCards(wRes.data.wallets);
      } catch (err) {
        console.error('load wallets error:', err);
      }

      try {
        const acctsRes = await client.get('/accounts');
        setLinkedAccounts(acctsRes.data.accounts);
      } catch (err) {
        console.error('load accounts error:', err);
      }

      try {
        const txnRes = await client.get('/transfer/history');
        setTransactions(txnRes.data.transactions);
        checkForNewActivity(txnRes.data.transactions);
      } catch (err) {
        console.error('load history error:', err);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshWallets();
      refreshAccounts();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.has_custom_pin) {
      setPinMode('change');
    } else {
      setPinMode('set');
    }
  }, [user?.has_custom_pin]);

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

  const refreshWallets = async () => {
    try {
      const wRes = await client.get('/wallets');
      setWalletCards(wRes.data.wallets);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshAccounts = async () => {
    try {
      const [acctsRes, wRes] = await Promise.all([
        client.get('/accounts'),
        client.get('/wallets'),
      ]);
      setLinkedAccounts(acctsRes.data.accounts);
      setWalletCards(wRes.data.wallets);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLinkAccount = async () => {
    if (!newAccount.provider_id || !newAccount.account_number) return;
    setLinkingAccount(true);
    setLinkError('');
    try {
      await client.post('/accounts', newAccount);
      await refreshAccounts();
      setNewAccount({ provider_id: '', account_number: '' });

      const pinRes = await client.get('/user/pin-status');
      if (!pinRes.data.has_custom_pin) {
        setShowPinPrompt(true);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Could not link account';
      setLinkError(msg);
      console.error('Link account error:', err.response?.data || err.message);
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleUnlinkAccount = async (id) => {
    await client.delete(`/accounts/${id}`);
    await refreshAccounts();
  };

  const handleSetPin = async () => {
    if (pinMode === 'change' && currentPin.length !== 4) {
      setPinSetMsg('Please enter your current PIN');
      return;
    }
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
      await client.post('/user/set-pin', { pin: newPin, currentPin: pinMode === 'change' ? currentPin : undefined });
      setPinSetMsg(pinMode === 'change' ? 'PIN changed successfully!' : 'PIN set successfully!');
      setNewPin('');
      setConfirmPin('');
      setCurrentPin('');
      setPinMode('change');
    } catch (err) {
      setPinSetMsg(err.response?.data?.error || err.response?.data?.message || 'Could not set PIN');
    } finally {
      setSettingPin(false);
    }
  };

  const handleSetPinPrompt = async () => {
    if (pinPromptPin.length !== 4 || !/^\d{4}$/.test(pinPromptPin)) {
      setPinPromptMsg('PIN must be exactly 4 digits');
      return;
    }
    if (pinPromptPin !== pinPromptConfirm) {
      setPinPromptMsg('PINs do not match');
      return;
    }
    setSettingPinPrompt(true);
    setPinPromptMsg('');
    try {
      await client.post('/user/set-pin', { pin: pinPromptPin });
      setShowPinPrompt(false);
      setPinPromptPin('');
      setPinPromptConfirm('');
      setPinMode('change');
      setPinSetMsg('');
      setNewPin('');
      setConfirmPin('');
      setCurrentPin('');
      setPinPromptPin('');
      setPinPromptConfirm('');
    } catch (err) {
      setPinPromptMsg(err.response?.data?.error || 'Could not set PIN');
    } finally {
      setSettingPinPrompt(false);
    }
  };

  const handleSend = async (payload) => {
    setError('');
    setSending(true);
    try {
      const res = await client.post('/wallets/transfers', payload);
      setLastTxn(res.data);
      await fetchProfile();
      await refreshWallets();
      const txnRes = await client.get('/transfer/history');
      setTransactions(txnRes.data.transactions);
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed');
    } finally {
      setSending(false);
    }
  };

  const verifyPin = async (pinCode) => {
    setError('');
    try {
      const res = await client.post('/user/verify-pin', { pin: pinCode });
      if (res.data.success) {
        setTransferStep('processing');
        await handleSend(transferPayload);
        setTransferStep('success');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect PIN. Please try again.');
      throw err;
    }
  };

  const resetSend = () => {
    setLastTxn(null);
    setError('');
    setSelectedToId('');
    setRecipient('');
    setAmount('');
    setTransferStep('form');
    setTransferPayload(null);
  };

  const getFromProvider = () => {
    const fromEl = document.getElementById('fromSelect');
    const fromId = fromEl?.value || '';
    const fromWallet = walletCards.find(w => w.id === fromId);
    return fromWallet?.provider || 'simplepay';
  };

  const getToProvider = () => {
    const toId = selectedToId || '';
    const toWallet = walletCards.find(w => w.id === toId);
    const toProviderObj = providers.find(p => p.id === toId);
    return toWallet?.provider || toProviderObj?.id || 'simplepay';
  };

  const renderSendStep = () => {
    if (transferStep === 'summary') {
      const fromEl = document.getElementById('fromSelect');
      const fromId = fromEl?.value || '';
      const fromWallet = walletCards.find(w => w.id === fromId);
      const toWallet = walletCards.find(w => w.id === selectedToId);
      const toProviderObj = providers.find(p => p.id === selectedToId);
      const fromName = fromWallet?.walletName || 'SimplePay Wallet';
      const toName = toWallet?.walletName || toProviderObj?.name || 'Provider';
      const { fee: computedFee, total } = calculateTransactionFee(amount, getFromProvider(), getToProvider());
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '24px' }}>Review Transfer</div>
          <div style={s.receiptCard}>
            {[
              ['From', fromName],
              ['To', toName],
              ['Recipient', recipient || 'N/A'],
              ['Amount', `NLe ${Number(amount).toLocaleString()}`],
              ['Transaction Fee', `NLe ${computedFee.toLocaleString()}`],
              ['Total Debit', `NLe ${total.toLocaleString()}`],
              ['Expected Delivery', 'Instant'],
            ].map(([k, v]) => (
              <div key={k} style={s.receiptRow}><span style={{ color: '#888' }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button style={{ ...s.btn, flex: 1, background: '#f5f5f5', color: '#666' }} onClick={() => setTransferStep('form')}>Cancel</button>
            <button style={{ ...s.btn, flex: 1 }} onClick={() => setTransferStep('pin')}>Continue</button>
          </div>
        </div>
      );
    }

    if (transferStep === 'pin') {
      return (
        <TransactionPin
          onConfirm={(pinCode) => verifyPin(pinCode)}
          onCancel={() => setTransferStep('summary')}
          loading={sending}
        />
      );
    }

    if (transferStep === 'processing') {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Processing Transfer...</div>
          <div style={{ fontSize: '14px', color: '#888', marginTop: '8px' }}>Please wait while we process your transaction</div>
        </div>
      );
    }

    if (transferStep === 'success') {
      const fromName = lastTxn?.from_provider || 'Wallet';
      const toName = lastTxn?.to_provider || 'Wallet';
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#1a6b3c' }}>Transfer Successful!</div>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '24px' }}>
            NLe {Number(lastTxn?.amount).toLocaleString()} sent
          </div>
          <div style={{ ...s.receiptCard, textAlign: 'left' }}>
            {[
              ['Reference', lastTxn?.reference],
              ['From', fromName],
              ['To', toName],
              ['Recipient', lastTxn?.receiver_identifier || recipient || 'N/A'],
              ['Amount', `NLe ${Number(lastTxn?.amount).toLocaleString()}`],
              ['Fee', `NLe ${Number(lastTxn?.fee || 0).toLocaleString()}`],
              ['Total Debited', `NLe ${Number(lastTxn?.total_deducted || lastTxn?.amount).toLocaleString()}`],
              ['Date & Time', new Date().toLocaleString()],
              ['Status', 'Completed'],
            ].map(([k, v]) => (
              <div key={k} style={s.receiptRow}><span style={{ color: '#888' }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span></div>
            ))}
          </div>
          <button style={s.btn} onClick={resetSend}>Done</button>
        </div>
      );
    }

    // Default: form step
    return (
      <>
        {/* FROM: all wallets */}
        <div style={s.sectionTitle}>FROM</div>
        <select style={s.select} id="fromSelect" onChange={e => setRecipient('')}>
          <option value="">Select source wallet</option>
          {walletCards.map(w => (
            <option key={w.id} value={w.id}>
              {w.walletName} — NLe {Number(w.balance).toLocaleString()}
            </option>
          ))}
        </select>

        {/* TO: linked wallets + providers */}
        <div style={{ ...s.sectionTitle, marginTop: '16px' }}>TO</div>
        <select style={s.select} id="toSelect" onChange={e => { setSelectedToId(e.target.value); setRecipient(''); }}>
          <option value="">Select destination</option>
          <optgroup label="Your Linked Accounts">
            {walletCards.filter(w => w.provider !== 'SimplePay').map(w => (
              <option key={w.id} value={w.id}>
                {w.walletName} — NLe {Number(w.balance).toLocaleString()}
              </option>
            ))}
          </optgroup>
          <optgroup label="All Providers">
            {providers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>

        {/* Recipient input — show whenever TO is selected */}
        {selectedToId && (
          <>
            <div style={{ ...s.sectionTitle, marginTop: '16px' }}>
              {selectedToId === 'simplepay' ? 'Recipient SimplePay Account Number' : selectedToId.startsWith('linked-') ? 'Confirm destination' : `Recipient ${providers.find(p => p.id === selectedToId)?.name || 'account'} Number`}
            </div>
            <input
              style={s.input}
              placeholder={selectedToId === 'simplepay' ? 'SP-12345678' : selectedToId.startsWith('linked-') ? 'Account number / phone' : '077 123 456'}
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
            />
          </>
        )}

        {/* Amount */}
        <div style={{ ...s.sectionTitle, marginTop: '16px' }}>Amount (NLe)</div>
        <div style={s.amountRow}>
          <span style={s.currencyBadge}>NLe</span>
          <input style={{ ...s.inputAmount, flex: 1 }} type="number" min="5" placeholder="50" id="amountInput" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {amount && parseFloat(amount) >= 5 && (() => {
          const fromProvider = getFromProvider();
          const toProvider = getToProvider();
          const { fee: computedFee, total } = calculateTransactionFee(amount, fromProvider, toProvider);
          return (
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Fee: NLe {computedFee.toLocaleString()} · Total: NLe {total.toLocaleString()}
            </div>
          );
        })()}
        {(!amount || parseFloat(amount) < 5) && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            Min: NLe 5
          </div>
        )}

        <button style={s.btn} onClick={() => {
          const fromEl = document.getElementById('fromSelect');
          const fromId = fromEl.value;
          const toId = selectedToId;
          if (!fromId || !toId || !amount || parseFloat(amount) < 5) {
            setError('Please select FROM wallet, TO destination, and enter amount (min NLe 5)');
            return;
          }
          if (!toId.startsWith('linked-') && !toId.startsWith('simplepay-') && !recipient) {
            setError('Please enter recipient account / phone number');
            return;
          }
          setError('');
          const payload = { fromWalletId: fromId, amount: parseFloat(amount) };
          if (String(toId).startsWith('linked-') || String(toId).startsWith('simplepay-')) {
            payload.toWalletId = toId;
          } else {
            payload.toProvider = toId;
            payload.toRecipient = recipient;
          }
          setTransferPayload(payload);
          setTransferStep('summary');
        }}>
          Continue
        </button>
      </>
    );
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

        {showPinPrompt && (
          <div style={{ background: '#fff4e5', border: '1px solid #ffd699', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#b87800' }}>🔒 Set your transaction PIN</div>
            <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>For security, please set a custom 4-digit PIN. The default PIN (1234) should not be used for transfers.</div>
            {pinPromptMsg && <div style={{ ...s.errorBox, background: pinPromptMsg.includes('success') ? '#e6f7ed' : '#fde8e8', color: pinPromptMsg.includes('success') ? '#1a6b3c' : '#a32d2d' }}>{pinPromptMsg}</div>}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center', maxWidth: '120px' }}
                type="password"
                maxLength={4}
                placeholder="New PIN"
                value={pinPromptPin}
                onChange={e => setPinPromptPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <input
                style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center', maxWidth: '120px' }}
                type="password"
                maxLength={4}
                placeholder="Confirm"
                value={pinPromptConfirm}
                onChange={e => setPinPromptConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <button style={{ ...s.btn, width: 'auto', padding: '10px 20px', marginTop: 0 }} disabled={pinPromptPin.length !== 4 || pinPromptConfirm.length !== 4 || settingPinPrompt} onClick={handleSetPinPrompt}>
                {settingPinPrompt ? 'Saving...' : 'Save PIN'}
              </button>
              <button style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px' }} onClick={() => setShowPinPrompt(false)}>Later</button>
            </div>
          </div>
        )}

        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo.png" alt="SimplePay" style={s.logoImg} />
            <div>
              <div style={s.headerSub}>Unified Payments · Sierra Leone</div>
            </div>
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

        {/* Wallet Carousel */}
        <div style={s.carouselSection}>
          <WalletCarousel wallets={walletCards} />
        </div>

        <div style={s.tabs}>
          {['send', 'accounts', 'history', 'network'].map(t => (
            <div key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => { setTab(t); resetSend(); }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <div style={s.content}>
          {loadError && <div style={s.errorBox}>{loadError}</div>}
          {error && <div style={s.errorBox}>{error}</div>}

          {/* === SEND TAB === */}
          {tab === 'send' && (
            <div>
              <div style={s.networkBadge}>● Network live — {providers.length} providers connected</div>
              {renderSendStep()}
            </div>
          )}

          {/* === ACCOUNTS TAB === */}
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
              {linkedAccounts.length === 0 && <p style={{ color: '#888', fontSize: '14px' }}>No accounts linked yet. Link one above.</p>}
              {linkedAccounts.map(acc => {
                const p = providers.find(pr => pr.id === acc.provider_id);
                return (
                  <div key={acc.id} style={s.txnItem}>
                    <div style={{ ...s.txnIcon, background: p?.color || '#1a6b3c' }}>{p?.short || '??'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{p?.name || acc.provider_id}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{acc.account_number} · ✓ Verified</div>
                    </div>
                    <button onClick={() => handleUnlinkAccount(acc.id)} style={{ background: 'none', border: 'none', color: '#a32d2d', fontSize: '13px', cursor: 'pointer' }}>Remove</button>
                  </div>
                );
              })}

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Your SimplePay Account</div>
              {user?.simplepay_account_number && (
                <div style={{ background: '#e6f7ed', border: '1px solid #a8dfc0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>Your SimplePay account number</div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#1a6b3c', letterSpacing: '1px' }}>{user.simplepay_account_number}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Share this to receive money</div>
                </div>
              )}

              <div style={{ ...s.sectionTitle, marginTop: '24px' }}>Transaction PIN</div>
              {pinSetMsg && <div style={{ ...s.errorBox, background: pinSetMsg.includes('success') ? '#e6f7ed' : '#fde8e8', color: pinSetMsg.includes('success') ? '#1a6b3c' : '#a32d2d' }}>{pinSetMsg}</div>}
              {pinMode === 'set' ? (
                <>
                  <label style={s.label}>New PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <label style={s.label}>Confirm PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <button style={{ ...s.btn, opacity: newPin.length === 4 && confirmPin.length === 4 ? 1 : 0.5 }} disabled={newPin.length !== 4 || confirmPin.length !== 4 || settingPin} onClick={handleSetPin}>
                    {settingPin ? 'Setting PIN...' : 'Set Transaction PIN'}
                  </button>
                </>
              ) : (
                <>
                  <label style={s.label}>Current PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <label style={s.label}>New PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <label style={s.label}>Confirm New PIN</label>
                  <input style={{ ...s.input, letterSpacing: '8px', fontSize: '20px', textAlign: 'center' }} type="password" maxLength={4} placeholder="••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <button style={{ ...s.btn, opacity: currentPin.length === 4 && newPin.length === 4 && confirmPin.length === 4 ? 1 : 0.5 }} disabled={currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4 || settingPin} onClick={handleSetPin}>
                    {settingPin ? 'Updating PIN...' : 'Change PIN'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* === HISTORY TAB === */}
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
                      {!isReceived && t.fee ? <div style={{ fontSize: '11px', fontWeight: 400 }}>Fee: NLe {Number(t.fee).toLocaleString()}</div> : null}
                      {!isReceived && t.total_deducted ? <div style={{ fontSize: '11px', fontWeight: 400 }}>Total: NLe {Number(t.total_deducted).toLocaleString()}</div> : null}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                      Ref: {t.reference?.slice(-8) || 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* === NETWORK TAB === */}
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
  app: { width: '100%', maxWidth: '720px' },
  header: { background: '#1a6b3c', color: 'white', padding: '16px 20px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logoImg: { width: '36px', height: '36px', borderRadius: '6px', flexShrink: 0 },
  logo: { fontSize: '20px', fontWeight: 600, color: 'white' },
  headerSub: { fontSize: '12px', opacity: 0.7, marginTop: '2px' },
  logoutBtn: { fontSize: '11px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', marginTop: '4px' },
  carouselSection: {
    background: 'white',
    padding: '16px 0',
    borderBottom: '1px solid #eee',
  },
  tabs: { display: 'flex', background: 'white', borderBottom: '1px solid #eee' },
  tab: { flex: 1, padding: '12px 8px', textAlign: 'center', fontSize: '13px', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent' },
  tabActive: { color: '#1a6b3c', borderBottomColor: '#1a6b3c', fontWeight: 500 },
  content: { background: 'white', borderRadius: '0 0 12px 12px', padding: '20px', border: '1px solid #eee', borderTop: 'none' },
  networkBadge: { display: 'inline-block', background: '#e6f7ed', color: '#1a6b3c', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', marginBottom: '12px' },
  sectionTitle: { fontSize: '11px', fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' },
  select: { width: '100%', padding: '12px', border: '2px solid #222', borderRadius: '10px', fontSize: '15px', background: 'white', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' },
  inputAmount: { flex: 1, padding: '12px', border: '2px solid #222', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' },
  amountRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  currencyBadge: { background: '#e6f7ed', color: '#1a6b3c', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, border: '2px solid #1a6b3c', whiteSpace: 'nowrap' },
  btn: { width: '100%', padding: '13px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', marginTop: '12px' },
  label: { display: 'block', fontSize: '13px', color: '#555', margin: '12px 0 6px' },
  errorBox: { background: '#fde8e8', color: '#a32d2d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px', marginTop: '8px' },
  notificationBanner: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', border: '1px solid', marginBottom: '12px' },
  notificationClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '14px', padding: '0 4px' },
  txnItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px' },
  txnIcon: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white', flexShrink: 0 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' },
  statCard: { background: '#f8f8f8', borderRadius: '8px', padding: '12px' },
  providerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  providerCard: { border: '1.5px solid #eee', borderRadius: '8px', padding: '10px 8px', textAlign: 'center' },
  providerIcon: { width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: 'white' },
  providerName: { fontSize: '11px', fontWeight: 500 },
  receiptCard: { background: '#f8f8f8', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', textAlign: 'left' },
  receiptRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid #eee' },
  successIcon: { width: '60px', height: '60px', borderRadius: '50%', background: '#e6f7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px', color: '#1a6b3c' },
  pinBox: { background: '#f8f8f8', borderRadius: '10px', padding: '16px', marginBottom: '12px', textAlign: 'center' },
  pinTitle: { fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' },
};
