import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, ActivityIndicator,
  SafeAreaView, StatusBar, Dimensions
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;

const providerColors = {
  SimplePay: '#1a6b3c', orange: '#ff6600', africell: '#e4003a', qmoney: '#8a2be2',
  rokel: '#1a6b3c', slcb: '#003580', gtbank: '#f37021', ecobank: '#003087',
  union: '#5c1a8a', access: '#c8102e', bsl: '#1a4080', uba: '#e4003a',
};

const providerShort = {
  SimplePay: 'SP', orange: 'OM', africell: 'AM', qmoney: 'QM',
  rokel: 'RCB', slcb: 'SLC', gtbank: 'GTB', ecobank: 'ECO',
  union: 'UTB', access: 'ACC', bsl: 'BSL', uba: 'UBA',
};

function WalletCard({ wallet, active }) {
  const color = providerColors[wallet.provider] || '#555';
  const short = providerShort[wallet.provider] || wallet.provider.slice(0, 3).toUpperCase();
  const isActive = wallet.status === 'Active';
  const isLinked = wallet.status === 'Linked';

  return (
    <View style={[styles.card, { borderColor: active ? color : '#222' }]}>
      <View style={[styles.cardBg, { backgroundColor: color }]} />
      <View style={styles.cardContent}>
        <View style={styles.topRow}>
          <View style={styles.chip}>
            <View style={styles.chipInner} />
          </View>
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.badgeText}>{short}</Text>
          </View>
        </View>
        <Text style={styles.walletName}>{wallet.walletName}</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.currency}>{wallet.currency || 'SLE'}</Text>
          <Text style={styles.balance}>{Number(wallet.balance).toLocaleString()}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isActive ? '#7edeab' : isLinked ? '#ffd699' : '#ccc' }]} />
          <Text style={styles.statusText}>{isActive ? 'Active' : isLinked ? 'Linked' : wallet.status}</Text>
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { user, logout, fetchProfile } = useAuth();
  const [tab, setTab] = useState('send');
  const [wallets, setWallets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedFrom, setSelectedFrom] = useState('');
  const [selectedTo, setSelectedTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTxn, setLastTxn] = useState(null);
  const [currentCard, setCurrentCard] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    client.get('/user/providers').then(r => setProviders(r.data.providers));
    client.get('/transfer/history').then(r => setTransactions(r.data.transactions));
    client.get('/wallets').then(r => setWallets(r.data.wallets)).catch(() => {});
  }, []);

  function calculateFee(amount) {
    const a = parseFloat(amount) || 0;
    if (a <= 50) return 1;
    if (a <= 200) return 3;
    if (a <= 500) return 7;
    if (a <= 1000) return 12;
    return Math.round(a * 0.01);
  }

  const fee = calculateFee(amount);
  const total = (parseFloat(amount) || 0) + fee;

  const handleSend = async () => {
    if (!selectedFrom || !selectedTo || !amount) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setSending(true);
    try {
      const payload = {
        fromWalletId: selectedFrom,
        amount: parseFloat(amount),
      };
      if (String(selectedTo).startsWith('linked-')) {
        payload.toWalletId = selectedTo;
      } else {
        payload.toProvider = selectedTo;
        payload.toRecipient = selectedTo === 'simplepay'
          ? (await promptAsync('Recipient SimplePay account number:')) || ''
          : (await promptAsync('Recipient phone / account number:')) || '';
      }

      const res = await client.post('/wallets/transfers', payload);
      setLastTxn(res.data);
      await fetchProfile();
      client.get('/wallets').then(r => setWallets(r.data.wallets)).catch(() => {});
      const history = await client.get('/transfer/history');
      setTransactions(history.data.transactions);
      setSelectedFrom('');
      setSelectedTo('');
      setAmount('');
    } catch (err) {
      Alert.alert('Transfer Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setSending(false);
    }
  };

  const promptAsync = (msg) => new Promise((resolve) => {
    Alert.prompt ? Alert.prompt(msg, '', (text) => resolve(text)) : resolve('');
  });

  const onScroll = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    setCurrentCard(Math.min(Math.max(index, 0), wallets.length - 1));
  }, [wallets.length]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#1a1a1a" barStyle="light-content" />
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

      {/* Wallet Carousel */}
      <View style={styles.carouselSection}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
          onMomentumScrollEnd={onScroll}
        >
          {wallets.map((w, i) => (
            <View key={w.id} style={{ width: CARD_WIDTH }}>
              <WalletCard wallet={w} active={i === currentCard} />
            </View>
          ))}
        </ScrollView>
        {wallets.length > 1 && (
          <View style={styles.dots}>
            {wallets.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === currentCard ? '#fff' : 'rgba(255,255,255,0.3)', width: i === currentCard ? 24 : 8 }]} />
            ))}
          </View>
        )}
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

            {/* FROM dropdown */}
            <Text style={styles.sectionTitle}>FROM</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerScroll}>
              {wallets.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.pill, selectedFrom === w.id && styles.pillSelected]}
                  onPress={() => setSelectedFrom(w.id)}
                >
                  <Text style={styles.pillText}>{w.walletName}</Text>
                  <Text style={styles.pillSub}>NLe {Number(w.balance).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* TO dropdown */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>TO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerScroll}>
              {providers.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pill, selectedTo === p.id && styles.pillSelected]}
                  onPress={() => setSelectedTo(p.id)}
                >
                  <View style={[styles.pillDot, { backgroundColor: p.color }]} />
                  <Text style={styles.pillText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Amount */}
            <Text style={styles.label}>Amount (SLL)</Text>
            <View style={styles.amountRow}>
              <View style={styles.currencyBadge}><Text style={styles.currencyText}>Le</Text></View>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="50000"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
            {parseFloat(amount) >= 5 && (
              <Text style={styles.feeText}>Fee: Le {fee.toLocaleString()} · Total: Le {total.toLocaleString()}</Text>
            )}

            <TouchableOpacity
              style={[styles.btn, (!selectedFrom || !selectedTo || !amount) && styles.btnDisabled]}
              disabled={!selectedFrom || !selectedTo || !amount || sending}
              onPress={handleSend}
            >
              {sending ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Send</Text>}
            </TouchableOpacity>

            {/* Success state */}
            {lastTxn && (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <View style={styles.successIcon}>
                  <Text style={styles.successIconText}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Transfer successful!</Text>
                <Text style={styles.successSub}>Le {Number(lastTxn.amount).toLocaleString()} sent</Text>
                <View style={styles.receipt}>
                  {[
                    ['Reference', lastTxn.reference],
                    ['Amount', `Le ${Number(lastTxn.amount).toLocaleString()}`],
                    ['Fee', `Le ${Number(lastTxn.fee || 0).toLocaleString()}`],
                    ['Total', `Le ${Number(lastTxn.total_deducted).toLocaleString()}`],
                    ['New balance', `Le ${Number(lastTxn.new_balance).toLocaleString()}`],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>{k}</Text>
                      <Text style={styles.receiptValue}>{v}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.btn} onPress={() => setLastTxn(null)}>
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
                  <Text style={styles.txnIconText}>{t.to_provider?.slice(0, 2).toUpperCase() || '??'}</Text>
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
            <View style={styles.networkBadge}><Text style={styles.networkBadgeText}>● Live network</Text></View>
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
            <View style={styles.providerRow}>
              {providers.map(p => (
                <View key={p.id} style={styles.netCard}>
                  <View style={[styles.netIcon, { backgroundColor: p.color }]}>
                    <Text style={styles.netIconText}>{p.short}</Text>
                  </View>
                  <Text style={styles.netName}>{p.name}</Text>
                  <Text style={styles.netStatus}>● Active</Text>
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
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { backgroundColor: '#1a1a1a', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333' },
  logo: { fontSize: 22, fontWeight: '700', color: 'white' },
  logoLight: { color: '#7edeab' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  welcomeText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  userName: { fontSize: 14, fontWeight: '500', color: 'white' },
  logoutBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  logoutText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  carouselSection: { backgroundColor: '#1a1a1a', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  card: { height: 190, borderRadius: 16, overflow: 'hidden', borderWidth: 2 },
  cardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.85 },
  cardContent: { padding: 20, flex: 1, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { width: 36, height: 26, backgroundColor: '#ffd700', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  chipInner: { width: 24, height: 16, borderWidth: 1.5, borderColor: '#b8960f', borderRadius: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '600' },
  walletName: { color: 'white', fontSize: 14, fontWeight: '500', opacity: 0.9, marginTop: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  currency: { color: 'white', fontSize: 14, fontWeight: '600', opacity: 0.8 },
  balance: { color: 'white', fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: 'white', fontSize: 11, opacity: 0.85, fontWeight: '500' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#7edeab' },
  tabText: { fontSize: 13, color: '#888' },
  tabTextActive: { color: '#7edeab', fontWeight: '600' },
  content: { flex: 1 },
  networkBadge: { backgroundColor: '#e6f7ed', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 12 },
  networkBadgeText: { color: '#1a6b3c', fontSize: 11 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#888', letterSpacing: 0.5, marginBottom: 10 },
  providerScroll: { marginBottom: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#2a2a2a', borderRadius: 10, marginRight: 8, borderWidth: 2, borderColor: '#333', flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillSelected: { borderColor: '#7edeab', backgroundColor: '#0d2a1a' },
  pillText: { color: 'white', fontSize: 13, fontWeight: '500' },
  pillSub: { color: '#888', fontSize: 11, marginLeft: 4 },
  pillDot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 13, color: '#aaa', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 2, borderColor: '#333', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#2a2a2a', color: 'white' },
  amountRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  currencyBadge: { backgroundColor: '#0d2a1a', borderWidth: 2, borderColor: '#1a6b3c', borderRadius: 10, padding: 12 },
  currencyText: { color: '#7edeab', fontWeight: '600', fontSize: 13 },
  feeText: { fontSize: 12, color: '#888', marginTop: 4 },
  btn: { backgroundColor: '#1a6b3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 2, borderColor: '#0d4a28' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e6f7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successIconText: { fontSize: 30, color: '#1a6b3c' },
  successTitle: { fontSize: 20, fontWeight: '600', color: 'white', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#888', marginBottom: 20, textAlign: 'center' },
  receipt: { backgroundColor: '#2a2a2a', borderRadius: 10, padding: 14, marginBottom: 16, width: '100%' },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#333' },
  receiptLabel: { color: '#888', fontSize: 13 },
  receiptValue: { fontWeight: '500', fontSize: 13, color: 'white' },
  txnItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#333', borderRadius: 10, marginBottom: 8, backgroundColor: '#1a1a1a' },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txnIconText: { color: 'white', fontSize: 11, fontWeight: '600' },
  txnName: { fontSize: 14, fontWeight: '500', color: 'white' },
  txnMeta: { fontSize: 12, color: '#888' },
  txnAmount: { color: '#ff6b6b', fontWeight: '500', fontSize: 14 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#2a2a2a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#333' },
  statLabel: { fontSize: 11, color: '#888' },
  statVal: { fontSize: 22, fontWeight: '600', color: 'white' },
  statSub: { fontSize: 11, color: '#888', marginTop: 2 },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  netCard: { width: '30%', backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 12, alignItems: 'center' },
  netIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  netIconText: { color: 'white', fontSize: 11, fontWeight: '600' },
  netName: { fontSize: 10, fontWeight: '500', color: 'white', textAlign: 'center' },
  netStatus: { fontSize: 9, color: '#1a6b3c', marginTop: 2 },
});
