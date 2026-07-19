import React, { useState, useEffect } from 'react';
import axios from 'axios';

const adminClient = axios.create({
  baseURL: 'https://simplepay-aqqv.onrender.com/api',
});

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('simplepay_admin_token') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminTab, setAdminTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (token) {
      fetchOverview();
      fetchUsers();
      fetchTransactions();
      fetchProviders();
      fetchDailyStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchOverview = async () => {
    try {
      const res = await adminClient.get('/admin/overview', { headers: { Authorization: `Bearer ${token}` } });
      setOverview(res.data);
    } catch (err) {
      handleAuthError();
    }
  };

  const fetchUsers = async (pageNum = 1) => {
    try {
      const res = await adminClient.get(`/admin/users?search=${encodeURIComponent(searchTerm)}&page=${pageNum}&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      setUsers(res.data.users);
      setTotalPages(Math.ceil(res.data.total / res.data.limit));
      setPage(pageNum);
    } catch (err) {
      handleAuthError();
    }
  };

  const fetchTransactions = async (pageNum = 1) => {
    try {
      const res = await adminClient.get(`/admin/transactions?search=${encodeURIComponent(searchTerm)}&page=${pageNum}&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      setTransactions(res.data.transactions);
      setTotalPages(Math.ceil(res.data.total / res.data.limit));
      setPage(pageNum);
    } catch (err) {
      handleAuthError();
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await adminClient.get('/admin/providers', { headers: { Authorization: `Bearer ${token}` } });
      setProviders(res.data.providers);
    } catch (err) {
      handleAuthError();
    }
  };

  const fetchDailyStats = async () => {
    try {
      const res = await adminClient.get('/admin/analytics/daily?days=30', { headers: { Authorization: `Bearer ${token}` } });
      setDailyStats(res.data.daily_stats);
    } catch (err) {
      handleAuthError();
    }
  };

  const fetchUserDetail = async (userId) => {
    try {
      const res = await adminClient.get(`/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      setUserDetail(res.data);
      setAdminTab('user-detail');
    } catch (err) {
      handleAuthError();
    }
  };

  const handleAuthError = () => {
    setError('Session expired. Please log in again.');
    handleLogout();
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
  };

  const handleReverse = async (reference) => {
    if (!window.confirm(`Reverse transaction ${reference}? This will refund the sender.`)) return;
    setActionMsg('');
    try {
      await adminClient.post(`/admin/transactions/${reference}/reverse`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActionMsg(`Transaction ${reference} reversed successfully.`);
      fetchTransactions();
      fetchOverview();
    } catch (err) {
      setActionMsg(err.response?.data?.error || 'Could not reverse transaction.');
    }
  };

  const exportTransactions = () => {
    const headers = ['Reference', 'Sender', 'Recipient', 'From', 'To', 'Amount', 'Fee', 'Total', 'Status', 'Date'];
    const rows = transactions.map(t => [
      t.reference,
      t.sender_name || '—',
      t.receiver_identifier,
      t.from_provider,
      t.to_provider,
      t.amount,
      t.fee || 0,
      t.total_deducted,
      t.status,
      new Date(t.created_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <img src="/logo.png" alt="SimplePay Admin" style={styles.logoImg} />
          <p style={styles.subtitle}>Operations dashboard</p>
          {error && <div style={styles.errorBox}>{error}</div>}
          <form onSubmit={handleLogin}>
            <label style={styles.label}>Admin password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
            />
            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <img src="/logo.png" alt="SimplePay Admin" style={styles.logoImg} />
          <p style={styles.subtitle}>Operations dashboard</p>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>Sign out</button>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'users', label: 'Users' },
          { key: 'transactions', label: 'Transactions' },
          { key: 'providers', label: 'Providers' },
          { key: 'analytics', label: 'Analytics' },
        ].map(t => (
          <div
            key={t.key}
            style={{ ...styles.tab, ...(adminTab === t.key ? styles.tabActive : {}) }}
            onClick={() => { setAdminTab(t.key); setSearchTerm(''); }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {actionMsg && <div style={styles.actionMsg}>{actionMsg}</div>}

      {adminTab === 'overview' && overview && (
        <div>
          <div style={styles.statGrid}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Users</div>
              <div style={styles.statVal}>{Number(overview.total_users).toLocaleString()}</div>
              <div style={styles.statSub}>Wallet holders</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Transactions</div>
              <div style={styles.statVal}>{Number(overview.total_transactions).toLocaleString()}</div>
              <div style={styles.statSub}>All time</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Volume</div>
              <div style={styles.statVal}>NLe {Number(overview.total_volume).toLocaleString()}</div>
              <div style={styles.statSub}>All time</div>
            </div>
            <div style={{ ...styles.statCard, background: '#e6f7ed' }}>
              <div style={styles.statLabel}>Total Revenue</div>
              <div style={{ ...styles.statVal, color: '#1a6b3c' }}>NLe {Number(overview.total_revenue).toLocaleString()}</div>
              <div style={styles.statSub}>From fees</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Today's Transactions</div>
              <div style={styles.statVal}>{Number(overview.today_transactions).toLocaleString()}</div>
              <div style={styles.statSub}>{new Date().toLocaleDateString()}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Today's Volume</div>
              <div style={styles.statVal}>NLe {Number(overview.today_volume).toLocaleString()}</div>
              <div style={styles.statSub}>{new Date().toLocaleDateString()}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Wallet Balance</div>
              <div style={styles.statVal}>NLe {Number(overview.total_wallet_balance).toLocaleString()}</div>
              <div style={styles.statSub}>Across all wallets</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Linked Accounts</div>
              <div style={styles.statVal}>{Number(overview.total_linked_accounts).toLocaleString()}</div>
              <div style={styles.statSub}>Active connections</div>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'users' && (
        <div>
          <input
            style={styles.searchInput}
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            onKeyDown={e => { if (e.key === 'Enter') fetchUsers(1); }}
          />
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>KYC</th>
                  <th style={styles.th}>Wallet Balance</th>
                  <th style={styles.th}>Linked</th>
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
                      <span style={{
                        ...styles.statusBadge,
                        background: u.kyc_status === 'approved' ? '#e6f7ed' : u.kyc_status === 'rejected' ? '#fde8e8' : '#fff4e5',
                        color: u.kyc_status === 'approved' ? '#1a6b3c' : u.kyc_status === 'rejected' ? '#a32d2d' : '#b87800',
                      }}>
                        {u.kyc_status || 'pending'}
                      </span>
                    </td>
                    <td style={styles.td}>NLe {Number(u.balance || 0).toLocaleString()}</td>
                    <td style={styles.td}>{u.linked_accounts_count || 0}</td>
                    <td style={styles.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      <button onClick={() => fetchUserDetail(u.id)} style={styles.viewBtn}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={styles.pagination}>
            <button disabled={page <= 1} onClick={() => fetchUsers(page - 1)} style={styles.pageBtn}>Previous</button>
            <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => fetchUsers(page + 1)} style={styles.pageBtn}>Next</button>
          </div>
        </div>
      )}

      {adminTab === 'user-detail' && userDetail && (
        <div>
          <button onClick={() => { setAdminTab('users'); setUserDetail(null); }} style={styles.backBtn}>
            ← Back to Users
          </button>
          <div style={styles.detailCard}>
            <h3 style={styles.detailTitle}>User Information</h3>
            <div style={styles.detailGrid}>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Name</span><span style={styles.detailValue}>{userDetail.user.full_name}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Phone</span><span style={styles.detailValue}>{userDetail.user.phone}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Email</span><span style={styles.detailValue}>{userDetail.user.email || '—'}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>KYC Status</span><span style={styles.detailValue}>{userDetail.user.kyc_status || 'pending'}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Wallet Balance</span><span style={styles.detailValue}>NLe {Number(userDetail.user.balance || 0).toLocaleString()}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Joined</span><span style={styles.detailValue}>{new Date(userDetail.user.created_at).toLocaleDateString()}</span></div>
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

      {adminTab === 'transactions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <input
              style={styles.searchInput}
              placeholder="Search by reference, sender, or recipient..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              onKeyDown={e => { if (e.key === 'Enter') fetchTransactions(1); }}
            />
            <button onClick={exportTransactions} style={styles.exportBtn}>Export CSV</button>
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
            <button disabled={page <= 1} onClick={() => fetchTransactions(page - 1)} style={styles.pageBtn}>Previous</button>
            <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => fetchTransactions(page + 1)} style={styles.pageBtn}>Next</button>
          </div>
        </div>
      )}

      {adminTab === 'providers' && (
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
                </tr>
              </thead>
              <tbody>
                {providers.map((p, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{p.from_provider}</td>
                    <td style={styles.td}>{Number(p.transaction_count).toLocaleString()}</td>
                    <td style={styles.td}>NLe {Number(p.total_volume).toLocaleString()}</td>
                    <td style={{ ...styles.td, color: '#1a6b3c', fontWeight: 500 }}>NLe {Number(p.total_fee).toLocaleString()}</td>
                    <td style={styles.td}>NLe {p.transaction_count > 0 ? Number(p.total_volume / p.transaction_count).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adminTab === 'analytics' && (
        <div>
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Daily Transaction Volume (Last 30 Days)</h3>
            <div style={styles.chartContainer}>
              {dailyStats.length > 0 ? (() => {
                const maxVol = Math.max(...dailyStats.map(d => Number(d.total_volume)));
                return (
                  <div style={styles.barChart}>
                    {dailyStats.map((day, i) => {
                      const height = maxVol > 0 ? (Number(day.total_volume) / maxVol) * 100 : 0;
                      return (
                        <div key={i} style={styles.barWrapper}>
                          <div style={{ ...styles.bar, height: `${height}%`, background: '#1a6b3c' }} title={`${day.date}: NLe ${Number(day.total_volume).toLocaleString()}`} />
                          <div style={styles.barLabel}>{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : <p style={styles.emptyText}>No data available</p>}
            </div>
          </div>
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Days</div>
              <div style={styles.statVal}>{dailyStats.length}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Avg Daily Volume</div>
              <div style={styles.statVal}>NLe {dailyStats.length > 0 ? Number(dailyStats.reduce((a, b) => a + Number(b.total_volume), 0) / dailyStats.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Peak Day</div>
              <div style={styles.statVal}>
                {dailyStats.length > 0 ? new Date(dailyStats.reduce((a, b) => Number(a.total_volume) > Number(b.total_volume) ? a : b).date).toLocaleDateString() : '—'}
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Revenue</div>
              <div style={{ ...styles.statVal, color: '#1a6b3c' }}>NLe {Number(dailyStats.reduce((a, b) => a + Number(b.total_fee), 0)).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  loginContainer: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' },
  loginCard: { background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', textAlign: 'center' },
  logoImg: { width: '80px', height: '80px', objectFit: 'contain', marginBottom: '8px' },
  subtitle: { fontSize: '13px', color: '#888', marginBottom: '1.5rem' },
  label: { display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', marginTop: '1.5rem' },
  errorBox: { background: '#fde8e8', color: '#a32d2d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' },
  page: { minHeight: '100vh', background: '#f5f5f5', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  logoutBtn: { padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', borderRadius: '10px', padding: '4px', maxWidth: '600px' },
  tab: { flex: 1, padding: '10px', textAlign: 'center', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#888' },
  tabActive: { background: '#1a6b3c', color: 'white', fontWeight: '500' },
  actionMsg: { background: '#e6f7ed', color: '#1a6b3c', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
  statCard: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  statLabel: { fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statVal: { fontSize: '28px', fontWeight: '600', color: '#1a1a1a' },
  statSub: { fontSize: '11px', color: '#aaa', marginTop: '4px' },
  searchInput: { width: '100%', maxWidth: '400px', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' },
  tableWrap: { background: 'white', borderRadius: '12px', overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '14px 16px', borderBottom: '2px solid #eee', color: '#888', fontWeight: '500', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  statusBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  reverseBtn: { padding: '6px 12px', background: '#fde8e8', color: '#a32d2d', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  viewBtn: { padding: '6px 12px', background: '#e6f7ed', color: '#1a6b3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' },
  pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  pageInfo: { fontSize: '13px', color: '#888' },
  exportBtn: { padding: '8px 16px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  backBtn: { padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '16px' },
  detailCard: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '16px' },
  detailTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#1a1a1a' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
  detailItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  detailLabel: { fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  detailValue: { fontSize: '15px', fontWeight: '500', color: '#1a1a1a' },
  emptyText: { color: '#888', fontSize: '14px', fontStyle: 'italic' },
  chartCard: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px' },
  chartTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#1a1a1a' },
  chartContainer: { height: '300px', display: 'flex', alignItems: 'flex-end' },
  barChart: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100%', width: '100%' },
  barWrapper: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', maxWidth: '40px', borderRadius: '4px 4px 0 0', minHeight: '4px', transition: 'height 0.3s' },
  barLabel: { fontSize: '10px', color: '#888', marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
};
