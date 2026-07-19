import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, ActivityIndicator,
  SafeAreaView, StatusBar
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function DashboardScreen() {
  const { user, wallet, logout, fetchProfile } = useAuth();
  const [tab, setTab] = useState('send');
  const [providers, setProviders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ recipient: '', amount: '', note: '' });
  const [sending, setSending] = useState(false);
  const [lastTxn, setLastTxn] = useState(null);

  useEffect(() => {
    client.get('/user/providers').then(r => setProviders(r.data.providers));
    client.get('/transfer/history').then(r => setTransactions(r.data.transactions));
    client.get('/wallets').then(r => setWallets(r.data.wallets)).catch(() => {});
  }, []);

  const fee = form.amount ? Math.round(parseFloat(form.amount) * 0.005) : 0;
  const total = form.amount ? parseFloat(form.amount) + fee : 0;

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await client.post('/wallets/transfers', {
        fromWalletId: selectedFrom.id,
        toWalletId: selectedTo.id,
        amount: parseFloat(form.amount),
        note: form.note,
      });
      setLastTxn(res.data);
      await fetchProfile();
      // Refresh wallets to show updated balances
      client.get('/wallets').then(r => setWallets(r.data.wallets)).catch(() => {});
      const history = await client.get('/transfer/history');
      setTransactions(history.data.transactions);
      setStep(4);
    } catch (err) {
      Alert.alert('Transfer Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setSending(false);
    }
  };

  const resetSend = () => {
    setSelectedFrom(null); setSelectedTo(null);
    setForm({ recipient: '', amount: '', note: '' });
    setStep(1); setLastTxn(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#1a6b3c" barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>Simple<Text style={styles.logoLight}>Pay</Text></Text>
          <Text style={styles.headerSub}>Unified Payments · Sierra Leone</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.userName}>{user?.full_name?.split(' ')[0]} {user?.full_name?.split(' ')[1]?.[0]}.</Text>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.balanceBar}>
        <View>
          <Text style={styles.balanceLabel}>SimplePay Wallet</Text>
          <Text style={styles.balanceAmount}>Le {wallet ? Number(wallet.balance).toLocaleString() : '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.balanceLabel}>Status</Text>
          <Text style={styles.verifiedText}>● Verified</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {['send', 'history', 'network'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
        {tab === 'send' && (
          <View>
            <View style={styles.networkBadge}>
              <Text style={styles.networkBadgeText}>● Network live — {providers.length} providers connected</Text>
            </View>
            <View style={styles.stepBar}>
              {[1, 2, 3].map(n => (
                <View key={n} style={[styles.stepDot, { backgroundColor: step > n ? '#1a6b3c' : step === n ? '#7edeab' : '#ddd' }]} />
              ))}
            </View>

            {step === 1 && (
              <View>
                <Text style={styles.sectionTitle}>FROM</Text>
                <View style={styles.providerGrid}>
                  {wallets.map(w => {
                    const provider = providers.find(p => p.id === w.provider);
                    const isSimplePay = w.provider === 'SimplePay';
                    return (
                      <TouchableOpacity 
                        key={w.id} 
                        style={[styles.providerCard, selectedFrom?.id === w.id && styles.providerSelected]} 
                        onPress={() => setSelectedFrom({ 
                          id: w.id, 
                          name: w.walletName || w.provider,
                          short: isSimplePay ? 'SP' : provider?.short || '??',
                          color: isSimplePay ? '#1a6b3c' : provider?.color || '#888',
                          type: isSimplePay ? 'wallet' : 'linked',
                          balance: w.balance
                        })}
                      >
                        <View style={[styles.providerIcon, { backgroundColor: isSimplePay ? '#1a6b3c' : provider?.color }]}>
                          <Text style={styles.providerIconText}>{isSimplePay ? 'SP' : provider?.short}</Text>
                        </View>
                        <Text style={styles.providerName}>{w.walletName || w.provider}</Text>
                        <Text style={styles.providerType}>{isSimplePay ? 'Wallet' : 'Linked'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.divider}>↓ to</Text>
                <Text style={styles.sectionTitle}>TO</Text>
                <View style={styles.providerGrid}>
                  {wallets.map(w => {
                    const provider = providers.find(p => p.id === w.provider);
                    const isSimplePay = w.provider === 'SimplePay';
                    return (
                      <TouchableOpacity 
                        key={w.id} 
                        style={[styles.providerCard, selectedTo?.id === w.id && styles.providerSelected]} 
                        onPress={() => setSelectedTo({ 
                          id: w.id, 
                          name: w.walletName || w.provider,
                          short: isSimplePay ? 'SP' : provider?.short || '??',
                          color: isSimplePay ? '#1a6b3c' : provider?.color || '#888',
                          type: isSimplePay ? 'wallet' : 'linked',
                          balance: w.balance
                        })}
                      >
                        <View style={[styles.providerIcon, { backgroundColor: isSimplePay ? '#1a6b3c' : provider?.color }]}>
                          <Text style={styles.providerIconText}>{isSimplePay ? 'SP' : provider?.short}</Text>
                        </View>
                        <Text style={styles.providerName}>{w.walletName || w.provider}</Text>
                        <Text style={styles.providerType}>{isSimplePay ? 'Wallet' : 'Linked'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={[styles.btn, (!selectedFrom || !selectedTo) && styles.btnDisabled]} disabled={!selectedFrom || !selectedTo || selectedFrom.id === selectedTo.id} onPress={() => setStep(2)}>
                  <Text style={styles.btnText}>Continue →</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={styles.routeText}><Text style={{ fontWeight: '600' }}>{selectedFrom?.name}</Text> → <Text style={{ fontWeight: '600' }}>{selectedTo?.name}</Text></Text>
                <Text style={styles.label}>Recipient phone / account</Text>
                <TextInput style={styles.input} placeholder="077 123 456" value={form.recipient} onChangeText={v => setForm({ ...form, recipient: v })} keyboardType="phone-pad" />
                <Text style={styles.label}>Amount (SLL)</Text>
                <View style={styles.amountRow}>
                  <View style={styles.currencyBadge}><Text style={styles.currencyText}>Le</Text></View>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="50000" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" />
                </View>
                <Text style={styles.feeText}>Fee: 0.5% = Le {fee.toLocaleString()} · Total: Le {total.toLocaleString()}</Text>
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput style={styles.input} placeholder="e.g. School fees" value={form.note} onChangeText={v => setForm({ ...form, note: v })} />
                <TouchableOpacity style={[styles.btn, (!form.recipient || !form.amount) && styles.btnDisabled]} disabled={!form.recipient || !form.amount} onPress={() => setStep(3)}>
                  <Text style={styles.btnText}>Review transfer →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={styles.sectionTitle}>CONFIRM TRANSFER</Text>
                <View style={styles.receiptCard}>
                  {[
                    ['From', selectedFrom?.name],
                    ['To', selectedTo?.name],
                    ['Recipient', form.recipient],
                    ['Amount', `Le ${Number(form.amount).toLocaleString()}`],
                    ['Fee (0.5%)', `Le ${fee.toLocaleString()}`],
                    ['Total deducted', `Le ${total.toLocaleString()}`],
                    ...(form.note ? [['Note', form.note]] : []),
                  ].map(([k, v]) => (
                    <View key={k} style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>{k}</Text>
                      <Text style={styles.receiptValue}>{v}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.btn} onPress={handleSend} disabled={sending}>
                  {sending ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Confirm & send 🔒</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 4 && lastTxn && (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <View style={styles.successIcon}>
                  <Text style={styles.successIconText}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Transfer successful!</Text>
                <Text style={styles.successSub}>Le {Number(lastTxn.amount).toLocaleString()} sent from {selectedFrom?.name} to {selectedTo?.name}</Text>
                <View style={[styles.receiptCard, { width: '100%' }]}>
                  {[
                    ['Reference', lastTxn.reference],
                    ['Amount sent', `Le ${Number(lastTxn.amount).toLocaleString()}`],
                    ['Total charged', `Le ${Number(lastTxn.total_deducted).toLocaleString()}`],
                    ['New balance', `Le ${Number(lastTxn.new_balance).toLocaleString()}`],
                    ['Status', '✓ Completed'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>{k}</Text>
                      <Text style={styles.receiptValue}>{v}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.btn} onPress={resetSend}>
                  <Text style={styles.btnText}>Send another transfer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {tab === 'history' && (
          <View>
            <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
            {transactions.length === 0 && <Text style={{ color: '#888', fontSize: 14 }}>No transactions yet.</Text>}
            {transactions.map(t => (
              <View key={t.id} style={styles.txnItem}>
                <View style={[styles.txnIcon, { backgroundColor: '#1a6b3c' }]}>
                  <Text style={styles.txnIconText}>{t.to_provider.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnName}>{t.receiver_identifier}</Text>
                  <Text style={styles.txnMeta}>{t.from_provider} → {t.to_provider}</Text>
                  <Text style={styles.txnMeta}>{new Date(t.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.txnAmount}>-Le {Number(t.amount).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'network' && (
          <View>
            <View style={styles.networkBadge}>
              <Text style={styles.networkBadgeText}>● Live network</Text>
            </View>
            <View style={styles.statGrid}>
              {[
                ['Active providers', providers.length, 'Banks + MNOs'],
                ['Avg settlement', '1.8s', 'Real-time rails'],
              ].map(([label, val, sub]) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statVal}>{val}</Text>
                  <Text style={styles.statSub}>{sub}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionTitle}>CONNECTED PROVIDERS</Text>
            <View style={styles.providerGrid}>
              {providers.map(p => (
                <View key={p.id} style={styles.providerCard}>
                  <View style={[styles.providerIcon, { backgroundColor: p.color }]}>
                    <Text style={styles.providerIconText}>{p.short}</Text>
                  </View>
                  <Text style={styles.providerName}>{p.name}</Text>
                  <Text style={[styles.providerType, { color: '#1a6b3c' }]}>● Active</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { backgroundColor: '#1a6b3c', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 22, fontWeight: '700', color: 'white' },
  logoLight: { color: '#7edeab' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  welcomeText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  userName: { fontSize: 14, fontWeight: '500', color: 'white' },
  logoutBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  logoutText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  balanceBar: { backgroundColor: '#145c32', padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  balanceAmount: { fontSize: 22, fontWeight: '600', color: 'white' },
  verifiedText: { fontSize: 13, color: '#7edeab' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#1a6b3c' },
  tabText: { fontSize: 13, color: '#888' },
  tabTextActive: { color: '#1a6b3c', fontWeight: '600' },
  content: { flex: 1 },
  networkBadge: { backgroundColor: '#e6f7ed', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 12 },
  networkBadgeText: { color: '#1a6b3c', fontSize: 11 },
  stepBar: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  stepDot: { flex: 1, height: 3, borderRadius: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#888', letterSpacing: 0.5, marginBottom: 10 },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  providerCard: { width: '30%', borderWidth: 1.5, borderColor: '#eee', borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: 'white' },
  providerSelected: { borderColor: '#1a6b3c', backgroundColor: '#e6f7ed' },
  providerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  providerIconText: { color: 'white', fontSize: 11, fontWeight: '600' },
  providerName: { fontSize: 10, fontWeight: '500', textAlign: 'center', lineHeight: 14 },
  providerType: { fontSize: 9, color: '#888', marginTop: 2, textAlign: 'center' },
  divider: { textAlign: 'center', color: '#888', fontSize: 13, marginVertical: 12 },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: 'white', color: '#1a1a1a' },
  amountRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  currencyBadge: { backgroundColor: '#e6f7ed', borderWidth: 1, borderColor: '#a8dfc0', borderRadius: 10, padding: 12 },
  currencyText: { color: '#1a6b3c', fontWeight: '600', fontSize: 13 },
  feeText: { fontSize: 12, color: '#888', marginTop: 4 },
  btn: { backgroundColor: '#1a6b3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  backBtn: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  backBtnText: { color: '#333', fontSize: 14 },
  receiptCard: { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14, marginBottom: 16 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  receiptLabel: { color: '#888', fontSize: 13 },
  receiptValue: { fontWeight: '500', fontSize: 13, color: '#1a1a1a' },
  routeText: { fontSize: 13, color: '#888', marginBottom: 16 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e6f7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successIconText: { fontSize: 30, color: '#1a6b3c' },
  successTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#888', marginBottom: 20, textAlign: 'center' },
  txnItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10, marginBottom: 8, backgroundColor: 'white' },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txnIconText: { color: 'white', fontSize: 11, fontWeight: '600' },
  txnName: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  txnMeta: { fontSize: 12, color: '#888' },
  txnAmount: { color: '#a32d2d', fontWeight: '500', fontSize: 14 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#f8f8f8', borderRadius: 10, padding: 12 },
  statLabel: { fontSize: 11, color: '#888' },
  statVal: { fontSize: 22, fontWeight: '600', color: '#1a1a1a' },
  statSub: { fontSize: 11, color: '#888', marginTop: 2 },
});