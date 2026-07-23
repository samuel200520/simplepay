import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://simplepay-backend.onrender.com/api';
const adminClient = axios.create({ baseURL: API_URL });

const useAdminApi = (token) => {
  const client = useMemo(() => axios.create({ baseURL: API_URL }), []);
  
  useEffect(() => {
    client.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('simplepay_admin_token');
          window.location.href = '/admin';
        }
        return Promise.reject(error);
      }
    );
  }, [token, client]);

  return client;
};

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('simplepay_admin_token') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [walletStats, setWalletStats] = useState(null);
  const [savingsOverview, setSavingsOverview] = useState(null);
  const [reversalStats, setReversalStats] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionMsg, setActionMsg] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30');

  const api = useAdminApi(token);

  const fetchData = useCallback(async (fetcher) => {
    try {
      setLoadError('');
      await fetcher();
    } catch (err) {
      if (err.response?.status !== 401) {
        setLoadError('Failed to load data');
      }
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchData(fetchOverview);
      fetchData(fetchUsers);
      fetchData(fetchTransactions);
      fetchData(fetchProviders);
      fetchData(fetchDailyStats);
      fetchData(fetchWalletStats);
      fetchData(fetchSavingsOverview);
      fetchData(fetchReversalStats);
      fetchData(fetchTopUsers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fetchData]);

  const fetchOverview = useCallback(async () => {
    const res = await api.get('/admin/overview');
    setOverview(res.data);
  }, [api]);

  const fetchUsers = useCallback(async (pageNum = 1) => {
    const res = await api.get(`/admin/users?search=${encodeURIComponent(search)}&page=${pageNum}&limit=25`);
    setUsers(res.data.users);
    setTotalPages(Math.ceil(res.data.total / res.data.limit));
    setPage(pageNum);
  }, [api, search]);

  const fetchTransactions = useCallback(async (pageNum = 1) => {
    const res = await api.get(`/admin/transactions?search=${encodeURIComponent(search)}&page=${pageNum}&limit=25`);
    setTransactions(res.data.transactions);
    setTotalPages(Math.ceil(res.data.total / res.data.limit));
    setPage(pageNum);
  }, [api, search]);

  const fetchProviders = useCallback(async () => {
    const res = await api.get('/admin/providers');
    setProviders(res.data.providers);
  }, [api]);

  const fetchDailyStats = useCallback(async () => {
    const res = await api.get(`/admin/analytics/daily?days=${dateRange}`);
    setDailyStats(res.data.daily_stats);
  }, [api, dateRange]);

  const fetchWalletStats = useCallback(async () => {
    const res = await api.get('/admin/wallets/stats');
    setWalletStats(res.data);
  }, [api]);

  const fetchSavingsOverview = useCallback(async () => {
    const res = await api.get('/admin/savings/overview');
    setSavingsOverview(res.data);
  }, [api]);

  const fetchReversalStats = useCallback(async () => {
    const res = await api.get('/admin/reversals');
    setReversalStats(res.data.reversals);
  }, [api]);

  const fetchTopUsers = useCallback(async () => {
    const res = await api.get('/admin/users/top');
    setTopUsers(res.data.top_users);
  }, [api]);

  const fetchUserDetail = async (userId) => {
    const res = await api.get(`/admin/users/${userId}`);
    setUserDetail(res.data);
    setActiveTab('user-detail');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminClient.post('/admin/login', { password });
      localStorage.setItem('simplepay_admin_token', res.data.token);
      setToken(res.data.token);
    } catch (err) {
      setError('Incorrect admin password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('simplepay_admin_token');
    setToken('');
    setUsers([]);
    setTransactions([]);
    setOverview(null);
    setUserDetail(null);
    setActiveTab('overview');
  };

  const handleReverse = async (reference) => {
    if (!window.confirm(`Reverse transaction ${reference}? This will refund the sender.`)) return;
    setActionMsg('');
    try {
      await api.post(`/admin/transactions/${reference}/reverse`);
      setActionMsg(`Transaction ${reference} reversed successfully.`);
      fetchTransactions(page);
      fetchOverview();
    } catch (err) {
      setActionMsg(err.response?.data?.error || 'Could not reverse transaction.');
    }
  };

  const exportCSV = (data, filename, columns) => {
    const headers = columns.map(c => c.label);
    const keys = columns.map(c => c.key);
    const rows = data.map(item => keys.map(key => {
      const val = item[key];
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }));
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.logoPlaceholder}>SP</div>
          <h1 style={styles.loginTitle}>SimplePay Admin</h1>
          <p style={styles.loginSubtitle}>Operations Dashboard</p>
          {error && <div style={styles.errorBox}>{error}</div>}
          <form onSubmit={handleLogin}>
            <label style={styles.label}>Admin Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
            />
            <button style={styles.btn} type="submit" disabled={loading || !password}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'transactions', label: 'Transactions', icon: '💳' },
    { key: 'analytics', label: 'Analytics', icon: '📈' },
    { key: 'providers', label: 'Providers', icon: '🏦' },
    { key: 'wallets', label: 'Wallets', icon: '👛' },
    { key: 'savings', label: 'Savings', icon: '💰' },
    { key: 'reversals', label: 'Reversals', icon: '↩️' },
    { key: 'top-users', label: 'Top Users', icon: '🏆' },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <aside style={{ ...styles.sidebar, width: sidebarOpen ? '260px' : '0px' }}>
          <div style={styles.sidebarContent}>
            <div style={styles.sidebarHeader}>
              <div style={styles.logoPlaceholder}>SP</div>
              <div>
                <div style={styles.brandTitle}>SimplePay</div>
                <div style={styles.brandSub}>Admin Panel</div>
              </div>
            </div>
            <nav style={styles.nav}>
              {navItems.map(item => (
                <div
                  key={item.key}
                  style={{ ...styles.navItem, ...(activeTab === item.key ? styles.navItemActive : {}) }}
                  onClick={() => { setActiveTab(item.key); setUserDetail(null); }}
                >
                  <span style={styles.navIcon}>{item.icon}</span>
                  <span style={styles.navLabel}>{item.label}</span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main style={styles.main}>
          <div style={styles.topBar}>
            <div style={styles.topBarLeft}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.menuBtn}>
                {sidebarOpen ? '◀' : '▶'}
              </button>
              <h2 style={styles.pageTitle}>
                {navItems.find(n => n.key === activeTab)?.label || 'Dashboard'}
              </h2>
            </div>
            <div style={styles.topBarRight}>
              <button onClick={() => { fetchOverview(); fetchUsers(page); fetchTransactions(page); fetchProviders(); fetchDailyStats(); fetchWalletStats(); fetchSavingsOverview(); fetchReversalStats(); fetchTopUsers(); }} style={styles.refreshBtn}>
                🔄 Refresh
              </button>
              <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
            </div>
          </div>

          {actionMsg && <div style={styles.actionMsg}>{actionMsg}</div>}
          {loadError && (
            <div style={styles.errorRow}>
              <span>{loadError}</span>
              <button onClick={() => {
                if (activeTab === 'users') fetchUsers(page);
                else if (activeTab === 'transactions') fetchTransactions(page);
                else if (activeTab === 'overview') fetchOverview();
                else if (activeTab === 'providers') fetchProviders();
                else if (activeTab === 'analytics') fetchDailyStats();
                else if (activeTab === 'wallets') fetchWalletStats();
                else if (activeTab === 'savings') fetchSavingsOverview();
                else if (activeTab === 'reversals') fetchReversalStats();
                else if (activeTab === 'top-users') fetchTopUsers();
              }} style={styles.retryBtn}>Retry</button>
            </div>
          )}

          {activeTab === 'overview' && overview && (
            <div>
              <div style={styles.kpiGrid}>
                <KPICard label="Total Users" value={Number(overview.total_users).toLocaleString()} sub="Wallet holders" color="#1a6b3c" />
                <KPICard label="Total Transactions" value={Number(overview.total_transactions).toLocaleString()} sub="All time" color="#2563eb" />
                <KPICard label="Total Volume" value={`NLe ${Number(overview.total_volume).toLocaleString()}`} sub="All time" color="#7c3aed" />
                <KPICard label="Total Revenue" value={`NLe ${Number(overview.total_revenue).toLocaleString()}`} sub="From fees" color="#059669" accent />
                <KPICard label="Today's Transactions" value={Number(overview.today_transactions).toLocaleString()} sub={new Date().toLocaleDateString()} color="#dc2626" />
                <KPICard label="Today's Volume" value={`NLe ${Number(overview.today_volume).toLocaleString()}`} sub={new Date().toLocaleDateString()} color="#ea5800" />
                <KPICard label="Wallet Balance" value={`NLe ${Number(overview.total_wallet_balance).toLocaleString()}`} sub="Across all wallets" color="#0891b2" />
                <KPICard label="Linked Accounts" value={Number(overview.total_linked_accounts).toLocaleString()} sub="Active connections" color="#be185d" />
              </div>

              <div style={styles.grid2}>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>Quick Stats</h3>
                  <div style={styles.quickStats}>
                    <QuickStat label="Avg Transaction" value={`NLe ${overview.total_transactions > 0 ? Number(overview.total_volume / overview.total_transactions).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}`} />
                    <QuickStat label="Reversed" value={Number(overview.total_reversed).toLocaleString()} />
                    <QuickStat label="Total Wallets" value={Number(overview.total_wallets).toLocaleString()} />
                  </div>
                </div>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>System Health</h3>
                  <div style={styles.healthGrid}>
                    <HealthItem label="API Status" value="Operational" color="#059669" />
                    <HealthItem label="Database" value="Connected" color="#059669" />
                    <HealthItem label="Providers" value={`${providers.length} Active`} color="#2563eb" />
                    <HealthItem label="Uptime" value="99.9%" color="#059669" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div>
              <input
                style={styles.searchInput}
                placeholder="Search by name, phone, or email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={e => { if (e.key === 'Enter') fetchUsers(1); }}
              />
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Phone</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>SimplePay #</th>
                      <th style={styles.th}>Linked</th>
                      <th style={styles.th}>KYC</th>
                      <th style={styles.th}>Balance</th>
                      <th style={styles.th}>Joined</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td style={styles.td}>{u.full_name}</td>
                        <td style={styles.td}>{u.phone}</td>
                        <td style={styles.td}>{u.email || '—'}</td>
                        <td style={styles.td}>
                          {u.simplepay_account_number ? (
                            <span style={{ ...styles.statusBadge, background: '#e6f7ed', color: '#1a6b3c' }}>{u.simplepay_account_number}</span>
                          ) : '—'}
                        </td>
                        <td style={styles.td}>{u.linked_accounts_count || 0}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            background: u.kyc_status === 'approved' ? '#e6f7ed' : u.kyc_status === 'rejected' ? '#fde8e8' : '#fff4e5',
                            color: u.kyc_status === 'approved' ? '#1a6b3c' : u.kyc_status === 'rejected' ? '#a32d2d' : '#b87800',
                          }}>
                            {u.kyc_status || 'pending'}
                          </span>
                        </td>
                        <td style={styles.td}>NLe {Number(u.balance || 0).toLocaleString()}</td>
                        <td style={styles.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={styles.td}>
                          <button onClick={() => fetchUserDetail(u.id)} style={styles.viewBtn}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={styles.pagination}>
                <button disabled={page <= 1} onClick={() => fetchUsers(page - 1)} style={styles.pageBtn}>← Previous</button>
                <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => fetchUsers(page + 1)} style={styles.pageBtn}>Next →</button>
              </div>
            </div>
          )}

          {activeTab === 'user-detail' && userDetail && (
            <div>
              <button onClick={() => { setActiveTab('users'); setUserDetail(null); }} style={styles.backBtn}>
                ← Back to Users
              </button>
              <div style={styles.detailCard}>
                <h3 style={styles.detailTitle}>User Information</h3>
                <div style={styles.detailGrid}>
                  <DetailItem label="Name" value={userDetail.user.full_name} />
                  <DetailItem label="Phone" value={userDetail.user.phone} />
                  <DetailItem label="Email" value={userDetail.user.email || '—'} />
                  <DetailItem label="KYC Status" value={userDetail.user.kyc_status || 'pending'} />
                  <DetailItem label="Wallet Balance" value={`NLe ${Number(userDetail.user.balance || 0).toLocaleString()}`} />
                  <DetailItem label="Joined" value={new Date(userDetail.user.created_at).toLocaleDateString()} />
                </div>
              </div>

              <div style={styles.detailCard}>
                <h3 style={styles.detailTitle}>Linked Accounts ({userDetail.linked_accounts.length})</h3>
                {userDetail.linked_accounts.length === 0 ? <p style={styles.emptyText}>No linked accounts</p> : (
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Provider</th><th style={styles.th}>Account</th><th style={styles.th}>Status</th></tr></thead>
                    <tbody>
                      {userDetail.linked_accounts.map(acc => (
                        <tr key={acc.id}>
                          <td style={styles.td}>{acc.provider_id}</td>
                          <td style={styles.td}>{acc.account_number}</td>
                          <td style={styles.td}><span style={{...styles.statusBadge, background:'#e6f7ed', color:'#1a6b3c'}}>Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={styles.detailCard}>
                <h3 style={styles.detailTitle}>Wallet Balances</h3>
                {userDetail.wallet_balances.length === 0 ? <p style={styles.emptyText}>No external wallet balances</p> : (
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Provider</th><th style={styles.th}>Account</th><th style={styles.th}>Balance</th><th style={styles.th}>Last Sync</th></tr></thead>
                    <tbody>
                      {userDetail.wallet_balances.map((wb, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{wb.provider_id}</td>
                          <td style={styles.td}>{wb.account_number}</td>
                          <td style={styles.td}>NLe {Number(wb.balance).toLocaleString()}</td>
                          <td style={styles.td}>{wb.last_sync ? new Date(wb.last_sync).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={styles.detailCard}>
                <h3 style={styles.detailTitle}>Recent Transactions</h3>
                {userDetail.recent_transactions.length === 0 ? <p style={styles.emptyText}>No transactions</p> : (
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Reference</th><th style={styles.th}>Route</th><th style={styles.th}>Amount</th><th style={styles.th}>Fee</th><th style={styles.th}>Status</th><th style={styles.th}>Date</th></tr></thead>
                    <tbody>
                      {userDetail.recent_transactions.map(t => (
                        <tr key={t.id}>
                          <td style={styles.td}>{t.reference.slice(-12)}</td>
                          <td style={styles.td}>{t.from_provider} → {t.to_provider}</td>
                          <td style={styles.td}>NLe {Number(t.amount).toLocaleString()}</td>
                          <td style={styles.td}>NLe {Number(t.fee || 0).toLocaleString()}</td>
                          <td style={styles.td}><span style={{...styles.statusBadge, background: t.status === 'completed' ? '#e6f7ed' : t.status === 'reversed' ? '#fde8e8' : '#fff4e5', color: t.status === 'completed' ? '#1a6b3c' : t.status === 'reversed' ? '#a32d2d' : '#b87800'}}>{t.status}</span></td>
                          <td style={styles.td}>{new Date(t.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <input
                  style={styles.searchInput}
                  placeholder="Search by reference, sender, or recipient..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  onKeyDown={e => { if (e.key === 'Enter') fetchTransactions(1); }}
                />
                <button onClick={() => exportCSV(transactions, 'transactions', [
                  { key: 'reference', label: 'Reference' },
                  { key: 'sender_name', label: 'Sender' },
                  { key: 'receiver_identifier', label: 'Recipient' },
                  { key: 'from_provider', label: 'From' },
                  { key: 'to_provider', label: 'To' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'fee', label: 'Fee' },
                  { key: 'total_deducted', label: 'Total' },
                  { key: 'status', label: 'Status' },
                  { key: 'created_at', label: 'Date' },
                ])} style={styles.exportBtn}>
                  📥 Export CSV
                </button>
              </div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Reference</th>
                      <th style={styles.th}>Sender</th>
                      <th style={styles.th}>Recipient</th>
                      <th style={styles.th}>Route</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Fee</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id}>
                        <td style={styles.td}>{t.reference.slice(-12)}</td>
                        <td style={styles.td}>{t.sender_name || '—'}</td>
                        <td style={styles.td}>{t.receiver_identifier}</td>
                        <td style={styles.td}>{t.from_provider} → {t.to_provider}</td>
                        <td style={styles.td}>NLe {Number(t.amount).toLocaleString()}</td>
                        <td style={styles.td}>NLe {Number(t.fee || 0).toLocaleString()}</td>
                        <td style={styles.td}>NLe {Number(t.total_deducted || t.amount).toLocaleString()}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            background: t.status === 'completed' ? '#e6f7ed' : t.status === 'reversed' ? '#fde8e8' : '#fff4e5',
                            color: t.status === 'completed' ? '#1a6b3c' : t.status === 'reversed' ? '#a32d2d' : '#b87800',
                          }}>
                            {t.status}
                          </span>
                        </td>
                        <td style={styles.td}>{new Date(t.created_at).toLocaleDateString()}</td>
                        <td style={styles.td}>
                          {t.status !== 'reversed' && (
                            <button onClick={() => handleReverse(t.reference)} style={styles.reverseBtn}>
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={styles.pagination}>
                <button disabled={page <= 1} onClick={() => fetchTransactions(page - 1)} style={styles.pageBtn}>← Previous</button>
                <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => fetchTransactions(page + 1)} style={styles.pageBtn}>Next →</button>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Daily Transaction Volume (Last {dateRange} Days)</h3>
                  <select value={dateRange} onChange={e => { setDateRange(e.target.value); fetchDailyStats(); }} style={styles.select}>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>
                <div style={styles.chartContainer}>
                  {dailyStats.length > 0 ? (() => {
                    const maxVol = Math.max(...dailyStats.map(d => Number(d.total_volume)));
                    const maxCount = Math.max(...dailyStats.map(d => Number(d.transaction_count)));
                    return (
                      <div style={styles.barChart}>
                        {dailyStats.map((day, i) => {
                          const height = maxVol > 0 ? (Number(day.total_volume) / maxVol) * 100 : 0;
                          const countHeight = maxCount > 0 ? (Number(day.transaction_count) / maxCount) * 100 : 0;
                          return (
                            <div key={i} style={styles.barWrapper}>
                              <div style={styles.barGroup}>
                                <div style={{ ...styles.bar, height: `${height}%`, background: '#1a6b3c' }} title={`Volume: NLe ${Number(day.total_volume).toLocaleString()}`} />
                                <div style={{ ...styles.bar, height: `${countHeight}%`, background: '#f5d062', opacity: 0.7 }} title={`Count: ${day.transaction_count}`} />
                              </div>
                              <div style={styles.barLabel}>{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : <p style={styles.emptyText}>No data available</p>}
                </div>
                <div style={styles.legend}>
                  <div style={styles.legendItem}><span style={{ ...styles.legendColor, background: '#1a6b3c' }}></span>Volume (NLe)</div>
                  <div style={styles.legendItem}><span style={{ ...styles.legendColor, background: '#f5d062' }}></span>Transactions</div>
                </div>
              </div>
              <div style={styles.statsRow}>
                <StatCard label="Total Days" value={dailyStats.length} />
                <StatCard label="Avg Daily Volume" value={`NLe ${dailyStats.length > 0 ? Number(dailyStats.reduce((a, b) => a + Number(b.total_volume), 0) / dailyStats.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}`} />
                <StatCard label="Peak Day" value={dailyStats.length > 0 ? new Date(dailyStats.reduce((a, b) => Number(a.total_volume) > Number(b.total_volume) ? a : b).date).toLocaleDateString() : '—'} />
                <StatCard label="Total Revenue" value={`NLe ${Number(dailyStats.reduce((a, b) => a + Number(b.total_fee), 0)).toLocaleString()}`} color="#1a6b3c" />
              </div>
            </div>
          )}

          {activeTab === 'providers' && (
            <div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Provider</th>
                      <th style={styles.th}>Transactions</th>
                      <th style={styles.th}>Volume</th>
                      <th style={styles.th}>Fees Collected</th>
                      <th style={styles.th}>Avg Tx Size</th>
                      <th style={styles.th}>Market Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p, i) => {
                      const totalVol = providers.reduce((sum, prov) => sum + Number(prov.total_volume), 0);
                      const share = totalVol > 0 ? (Number(p.total_volume) / totalVol * 100).toFixed(1) : 0;
                      return (
                        <tr key={i}>
                          <td style={{ ...styles.td, fontWeight: 500 }}>{p.from_provider}</td>
                          <td style={styles.td}>{Number(p.transaction_count).toLocaleString()}</td>
                          <td style={styles.td}>NLe {Number(p.total_volume).toLocaleString()}</td>
                          <td style={{ ...styles.td, color: '#1a6b3c', fontWeight: 500 }}>NLe {Number(p.total_fee).toLocaleString()}</td>
                          <td style={styles.td}>NLe {p.transaction_count > 0 ? Number(p.total_volume / p.transaction_count).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}</td>
                          <td style={styles.td}>
                            <div style={styles.progressBar}>
                              <div style={{ ...styles.progressFill, width: `${share}%` }} />
                            </div>
                            <span style={styles.progressLabel}>{share}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'wallets' && walletStats && (
            <div>
              <div style={styles.kpiGrid}>
                <KPICard label="Total Balance" value={`NLe ${Number(walletStats.total_balance).toLocaleString()}`} sub="All wallets" color="#1a6b3c" />
                <KPICard label="Total Wallets" value={Number(walletStats.total_wallets).toLocaleString()} sub="Active wallets" color="#2563eb" />
                <KPICard label="Avg Balance" value={`NLe ${Number(walletStats.avg_balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="Per wallet" color="#7c3aed" />
                <KPICard label="Linked Accounts" value={Number(walletStats.total_linked).toLocaleString()} sub="External" color="#059669" />
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Top Wallets by Volume</h3>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Wallet ID</th><th style={styles.th}>Balance</th><th style={styles.th}>Transactions</th><th style={styles.th}>Volume</th></tr></thead>
                    <tbody>
                      {walletStats.top_wallets.map((w, i) => (
                        <tr key={i}>
                          <td style={styles.td}>#{w.id}</td>
                          <td style={styles.td}>NLe {Number(w.balance).toLocaleString()}</td>
                          <td style={styles.td}>{Number(w.transaction_count).toLocaleString()}</td>
                          <td style={styles.td}>NLe {Number(w.volume).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'savings' && savingsOverview && (
            <div>
              <div style={styles.kpiGrid}>
                <KPICard label="Total Saved" value={`NLe ${Number(savingsOverview.total_saved).toLocaleString()}`} sub="All time deposits" color="#059669" />
                <KPICard label="Total Deposits" value={Number(savingsOverview.total_deposits).toLocaleString()} sub="Transactions" color="#2563eb" />
                <KPICard label="Active Savers" value={Number(savingsOverview.savers_count).toLocaleString()} sub="Unique users" color="#7c3aed" />
                <KPICard label="Total Goals" value={Number(savingsOverview.total_goals).toLocaleString()} sub={`${savingsOverview.active_goals} active`} color="#ea5800" />
                <KPICard label="Target Amount" value={`NLe ${Number(savingsOverview.total_target).toLocaleString()}`} sub="All goals" color="#dc2626" />
                <KPICard label="Current Saved" value={`NLe ${Number(savingsOverview.total_current).toLocaleString()}`} sub="Progress" color="#0891b2" />
              </div>
            </div>
          )}

          {activeTab === 'reversals' && (
            <div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Date</th><th style={styles.th}>Total Reversed</th><th style={styles.th}>Volume Reversed</th></tr></thead>
                  <tbody>
                    {reversalStats.map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{new Date(r.date).toLocaleDateString()}</td>
                        <td style={styles.td}>{Number(r.total_reversed).toLocaleString()}</td>
                        <td style={styles.td}>NLe {Number(r.reversed_volume).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'top-users' && (
            <div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Rank</th><th style={styles.th}>Name</th><th style={styles.th}>Phone</th><th style={styles.th}>Account</th><th style={styles.th}>Balance</th><th style={styles.th}>Transactions</th><th style={styles.th}>Volume</th></tr></thead>
                  <tbody>
                    {topUsers.map((u, i) => (
                      <tr key={u.id}>
                        <td style={styles.td}>
                          <span style={{ ...styles.rankBadge, background: i < 3 ? '#f5d062' : '#333' }}>{i + 1}</span>
                        </td>
                        <td style={{ ...styles.td, fontWeight: 500 }}>{u.full_name}</td>
                        <td style={styles.td}>{u.phone}</td>
                        <td style={styles.td}>{u.simplepay_account_number}</td>
                        <td style={styles.td}>NLe {Number(u.balance || 0).toLocaleString()}</td>
                        <td style={styles.td}>{Number(u.transaction_count).toLocaleString()}</td>
                        <td style={styles.td}>NLe {Number(u.total_volume).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const KPICard = ({ label, value, sub, color, accent }) => (
  <div style={{ ...styles.kpiCard, borderLeft: `4px solid ${color}` }}>
    <div style={styles.kpiLabel}>{label}</div>
    <div style={{ ...styles.kpiValue, color: accent ? color : '#e0e0e0' }}>{value}</div>
    <div style={styles.kpiSub}>{sub}</div>
  </div>
);

const StatCard = ({ label, value, color }) => (
  <div style={styles.statCard}>
    <div style={styles.statLabel}>{label}</div>
    <div style={{ ...styles.statVal, color: color || '#e0e0e0' }}>{value}</div>
  </div>
);

const QuickStat = ({ label, value }) => (
  <div style={styles.quickStatItem}>
    <div style={styles.quickStatLabel}>{label}</div>
    <div style={styles.quickStatValue}>{value}</div>
  </div>
);

const HealthItem = ({ label, value, color }) => (
  <div style={styles.healthItem}>
    <div style={styles.healthLabel}>{label}</div>
    <div style={{ ...styles.healthValue, color }}>{value}</div>
  </div>
);

const DetailItem = ({ label, value }) => (
  <div style={styles.detailItem}>
    <span style={styles.detailLabel}>{label}</span>
    <span style={styles.detailValue}>{value}</span>
  </div>
);

const styles = {
  loginContainer: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' },
  loginCard: { background: '#1a1a1a', padding: '2.5rem', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center', border: '1px solid #333' },
  logoPlaceholder: { width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #1a6b3c 0%, #f5d062 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 700, marginBottom: '12px' },
  loginTitle: { fontSize: '24px', fontWeight: 700, color: 'white', margin: '0 0 4px' },
  loginSubtitle: { fontSize: '14px', color: '#888', marginBottom: '1.5rem' },
  label: { display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '6px', marginTop: '12px', textAlign: 'left' },
  input: { width: '100%', padding: '12px 14px', background: '#222', border: '1px solid #444', borderRadius: '10px', color: 'white', fontSize: '15px', boxSizing: 'border-box', outline: 'none' },
  btn: { width: '100%', padding: '14px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '1.5rem' },
  errorBox: { background: '#3a1515', color: '#e056a0', padding: '12px', borderRadius: '10px', fontSize: '13px', marginBottom: '1rem', border: '1px solid #5c1a1a' },
  page: { minHeight: '100vh', background: '#0f0f0f', color: '#e0e0e0' },
  layout: { display: 'flex', minHeight: '100vh' },
  sidebar: { background: '#1a1a1a', borderRight: '1px solid #333', overflow: 'hidden', transition: 'width 0.3s', flexShrink: 0 },
  sidebarContent: { width: '260px', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { display: 'flex', alignItems: 'center', gap: '14px', padding: '24px 20px', borderBottom: '1px solid #333' },
  brandTitle: { fontSize: '18px', fontWeight: 700, color: 'white' },
  brandSub: { fontSize: '12px', color: '#888' },
  nav: { flex: 1, padding: '12px 8px', overflowY: 'auto' },
  navItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#888', marginBottom: '4px', transition: 'all 0.2s' },
  navItemActive: { background: '#1a6b3c', color: 'white', fontWeight: '500' },
  navIcon: { fontSize: '18px' },
  navLabel: { fontSize: '14px' },
  main: { flex: 1, overflow: 'auto', padding: '24px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #333' },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  menuBtn: { background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#ddd', cursor: 'pointer', fontSize: '16px', padding: '8px 12px' },
  pageTitle: { fontSize: '22px', fontWeight: 600, color: 'white', margin: 0 },
  topBarRight: { display: 'flex', gap: '10px' },
  refreshBtn: { padding: '8px 16px', background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#ddd', cursor: 'pointer', fontSize: '13px' },
  logoutBtn: { padding: '8px 16px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  actionMsg: { background: '#132a18', color: '#7edeab', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', border: '1px solid #1a6b3c' },
  errorRow: { background: '#3a1515', color: '#e056a0', padding: '10px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', border: '1px solid #5c1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  retryBtn: { background: 'none', border: 'none', color: '#f5d062', cursor: 'pointer', fontSize: '13px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' },
  kpiCard: { background: '#1a1a1a', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid #333', position: 'relative', overflow: 'hidden' },
  kpiLabel: { fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.6px' },
  kpiValue: { fontSize: '24px', fontWeight: 700, color: '#e0e0e0', marginBottom: '4px' },
  kpiSub: { fontSize: '11px', color: '#666' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' },
  card: { background: '#1a1a1a', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid #333' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'white' },
  quickStats: { display: 'flex', flexDirection: 'column', gap: '12px' },
  quickStatItem: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #2a2a2a' },
  quickStatLabel: { fontSize: '13px', color: '#888' },
  quickStatValue: { fontSize: '14px', fontWeight: 500, color: '#e0e0e0' },
  healthGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  healthItem: { background: '#222', borderRadius: '10px', padding: '14px', border: '1px solid #333', textAlign: 'center' },
  healthLabel: { fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' },
  healthValue: { fontSize: '16px', fontWeight: 600 },
  searchInput: { width: '100%', maxWidth: '400px', padding: '12px 16px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', color: 'white', fontSize: '14px', marginBottom: '16px', outline: 'none' },
  tableWrap: { background: '#1a1a1a', borderRadius: '12px', overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid #333', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '14px 16px', borderBottom: '2px solid #333', color: '#888', fontWeight: '500', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', borderBottom: '1px solid #2a2a2a', whiteSpace: 'nowrap', color: '#e0e0e0' },
  statusBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  reverseBtn: { padding: '6px 12px', background: '#3a1515', color: '#e056a0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  viewBtn: { padding: '6px 12px', background: '#132a18', color: '#7edeab', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' },
  pageBtn: { padding: '8px 16px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#ddd' },
  pageInfo: { fontSize: '13px', color: '#888' },
  exportBtn: { padding: '8px 16px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  backBtn: { padding: '8px 16px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', color: '#ddd' },
  detailCard: { background: '#1a1a1a', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid #333', marginBottom: '16px' },
  detailTitle: { fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'white' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
  detailItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  detailLabel: { fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  detailValue: { fontSize: '15px', fontWeight: 500, color: '#e0e0e0' },
  emptyText: { color: '#888', fontSize: '14px', fontStyle: 'italic' },
  chartContainer: { height: '400px', display: 'flex', alignItems: 'flex-end' },
  barChart: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100%', width: '100%' },
  barWrapper: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barGroup: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '100%' },
  bar: { width: '100%', maxWidth: '24px', borderRadius: '4px 4px 0 0', minHeight: '4px', transition: 'height 0.3s' },
  barLabel: { fontSize: '10px', color: '#888', marginTop: '6px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' },
  legend: { display: 'flex', gap: '24px', marginTop: '16px', justifyContent: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#888' },
  legendColor: { width: '16px', height: '16px', borderRadius: '4px' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '20px' },
  statCard: { background: '#1a1a1a', borderRadius: '12px', padding: '18px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid #333' },
  statLabel: { fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statVal: { fontSize: '22px', fontWeight: 600, color: '#e0e0e0' },
  progressBar: { width: '100%', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' },
  progressFill: { height: '100%', background: '#1a6b3c', borderRadius: '4px' },
  progressLabel: { fontSize: '12px', color: '#888' },
  rankBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', fontSize: '13px', fontWeight: 700, color: '#0f0f0f' },
  select: { padding: '8px 12px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', color: 'white', fontSize: '13px', cursor: 'pointer' },
};