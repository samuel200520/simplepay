import React, { useState, useEffect } from 'react';
import client from '../api/client';

const PROVIDER_COLORS = {
  'simplepay': '#1a6b3c', 'orange': '#ff6600', 'africell': '#e4003a',
  'qmoney': '#8a2be2', 'rokel': '#1a6b3c', 'slcb': '#003580',
  'gtbank': '#f37021', 'ecobank': '#003087', 'union': '#5c1a8a',
  'access': '#c8102e', 'bsl': '#1a4080', 'uba': '#e4003a',
};

const DEFAULT_COLOR = '#b2bec3';

const SUGGESTIONS = [
  { icon: '💰', text: 'How much money do I have?' },
  { icon: '📊', text: 'Where is my money going?' },
  { icon: '🏦', text: 'Compare my wallets' },
  { icon: '💡', text: 'Give me saving tips' },
  { icon: '🎯', text: 'How close am I to my goals?' },
  { icon: '📈', text: 'Analyze my finances' },
];

export default function SmartMoneyCoach({ initialData }) {
  const [data, setData] = useState(initialData || null);
  const [budget, setBudget] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(!initialData);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!initialData) {
      loadData();
    } else {
      setData(initialData);
      loadBudget();
    }
    loadConversationHistory();
  }, [initialData]);

  const loadData = async () => {
    try {
      const [insightsRes, budgetRes] = await Promise.all([
        client.get('/insights/insights'),
        client.get('/insights/budget'),
      ]);
      setData(insightsRes.data);
      setBudget(budgetRes.data);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBudget = async () => {
    try {
      const res = await client.get('/insights/budget');
      setBudget(res.data);
    } catch (err) {
      console.error('Load budget error:', err);
    }
  };

  const loadConversationHistory = async () => {
    try {
      const res = await client.get('/insights/chat/history');
      if (res.data.history && res.data.history.length > 0) {
        setChatMessages(res.data.history);
      }
    } catch (err) {
      console.error('Load history error:', err);
    } finally {
      setHistoryLoaded(true);
    }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;

    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setSending(true);

    try {
      const res = await client.post('/insights/chat', { message: userMessage });
      setChatMessages(prev => [...prev, { role: 'assistant', text: res.data.response }]);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'I couldn\'t process your request. Please try again.';
      setChatMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
    } finally {
      setSending(false);
    }
  };

  const handleSuggestion = (text) => {
    setChatInput(text);
  };

  const handleClearHistory = async () => {
    try {
      await client.post('/insights/chat/history', { clear: true });
      setChatMessages([{ role: 'assistant', text: 'Conversation cleared. How can I help you with your finances today?' }]);
    } catch (err) {
      console.error('Clear history error:', err);
    }
  };

  const walletBreakdown = data?.wallet_breakdown || [];
  const spendingCategories = data?.spending_categories || data?.spending_breakdown || [];
  const totalSent = Number(data?.total_sent || data?.total_spent || 0);
  const totalReceived = Number(data?.total_received || 0);
  const totalSaved = Number(data?.total_saved || 0);
  const healthScore = data?.health_score || 0;
  const insights = data?.insights || [];
  const goals = data?.goals || [];
  const walletActivity = data?.wallet_activity || null;

  const scoreColor = healthScore >= 80 ? '#1a6b3c' : healthScore >= 60 ? '#f9ca24' : '#e056a0';
  const scoreLabel = data?.health_label || (healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Improvement');
  const emptyState = !spendingCategories.length && totalSent === 0 && totalReceived === 0 && walletBreakdown.length <= 1;

  // Compute total from walletBreakdown for the overview cards
  const walletTotal = walletBreakdown.reduce((sum, w) => sum + Number(w.balance || 0), 0);

  if (loading || !historyLoaded) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading your financial dashboard...</div>;
  }

  return (
    <div style={styles.wrapper}>
      {/* ── Empty State ─────────────────────────────────────────── */}
      {emptyState && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🏦</div>
          <div style={{ fontSize: '22px', fontWeight: 600, marginBottom: '12px', color: '#f5d062' }}>
            Welcome to Smart Money Coach
          </div>
          <div style={{ fontSize: '14px', opacity: 0.8, maxWidth: '520px', margin: '0 auto', lineHeight: '1.6' }}>
            Link your bank accounts and mobile money wallets to get a complete financial picture.
            As your transaction history grows, your Smart Money Coach will provide personalized insights.
          </div>
        </div>
      )}

      {/* ── Financial Health Score ───────────────────────────────── */}
      {!emptyState && (
        <div style={styles.healthCard}>
          <div style={styles.healthRow}>
            <div style={styles.healthDonut}>
              <div style={{
                ...styles.donutOuter,
                background: `conic-gradient(${scoreColor} ${healthScore}%, #444 ${healthScore}%)`
              }}>
                <div style={styles.donutInner}>
                  <div style={{ ...styles.donutScore, color: scoreColor }}>{healthScore}</div>
                  <div style={styles.donutMax}>/ 100</div>
                </div>
              </div>
            </div>
            <div style={styles.healthText}>
              <div style={styles.healthTitle}>Financial Health Score</div>
              <div style={{ ...styles.healthLabel, color: scoreColor }}>{scoreLabel}</div>
              <div style={styles.healthDesc}>
                {healthScore >= 80 ? 'Excellent! You\'re managing your finances well across all wallets. Keep maintaining these healthy habits.' :
                 healthScore >= 60 ? 'Good progress! Focus on building your savings and reducing unnecessary spending.' :
                 'There\'s room for improvement. Start tracking expenses, create savings goals, and link more wallets.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Total Financial Overview ─────────────────────────────── */}
      {!emptyState && (
        <>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>💰 Total Financial Overview</span>
            <span style={styles.sectionBadge}>{walletBreakdown.length} wallet{walletBreakdown.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={styles.overviewCards}>
            {[
              { label: 'Total Available Funds', value: `NLe ${walletTotal.toLocaleString()}`, color: '#1a6b3c', icon: '💰' },
              { label: 'Money Sent', value: `NLe ${totalSent.toLocaleString()}`, color: '#e056a0', icon: '📤' },
              { label: 'Money Received', value: `NLe ${totalReceived.toLocaleString()}`, color: '#1a6b3c', icon: '📥' },
              { label: 'Total Saved', value: `NLe ${totalSaved.toLocaleString()}`, color: '#00b894', icon: '🏦' },
            ].map((card, i) => (
              <div key={i} style={styles.overviewCard}>
                <div style={styles.overviewCardIcon}>{card.icon}</div>
                <div style={styles.overviewCardLabel}>{card.label}</div>
                <div style={{ ...styles.overviewCardValue, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* ── Wallet Breakdown ──────────────────────────────────── */}
          {walletBreakdown.length > 0 && (
            <div style={styles.walletSection}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>📱 Wallet Breakdown</span>
              </div>
              <div style={styles.walletGrid}>
                {walletBreakdown.map((w, i) => {
                  const pct = walletTotal > 0 ? Math.round((Number(w.balance || 0) / walletTotal) * 100) : 0;
                  const color = PROVIDER_COLORS[w.provider] || DEFAULT_COLOR;
                  return (
                    <div key={i} style={styles.walletCard}>
                      <div style={styles.walletCardTop}>
                        <div style={{ ...styles.walletIcon, background: color }}>
                          {String(w.provider || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={styles.walletName}>{w.name}</div>
                          <div style={styles.walletProvider}>{w.type === 'bank' ? 'Bank Account' : w.type === 'mobile_money' ? 'Mobile Money' : 'Wallet'}</div>
                        </div>
                      </div>
                      <div style={styles.walletBalance}>NLe {Number(w.balance || 0).toLocaleString()}</div>
                      <div style={styles.walletBar}>
                        <div style={{ ...styles.walletBarFill, width: `${pct}%`, background: color }} />
                      </div>
                      <div style={styles.walletPct}>{pct}% of total</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Most Active Wallet ────────────────────────────────── */}
          {walletActivity && walletActivity.mostActive && walletActivity.mostActive.totalTransactions > 0 && (
            <div style={styles.insightBanner}>
              <span style={{ fontSize: '18px', marginRight: '10px' }}>📈</span>
              <span>Your most active wallet this month is <strong>{walletActivity.mostActive.name}</strong> with {walletActivity.mostActive.totalTransactions} transactions.</span>
            </div>
          )}

          {/* ── Smart Insights ────────────────────────────────────── */}
          {insights.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>💡 Smart Insights</span>
              </div>
              <div style={styles.insightsList}>
                {insights.slice(0, 5).map((ins, i) => (
                  <div key={i} style={{
                    ...styles.insightItem,
                    borderLeftColor: ins.type === 'warning' ? '#e056a0' :
                                     ins.type === 'success' ? '#1a6b3c' :
                                     ins.type === 'goal' ? '#f9ca24' : '#4ecdc4'
                  }}>
                    <div style={styles.insightTitle}>{ins.title}</div>
                    <div style={styles.insightMessage}>{ins.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Spending Breakdown ────────────────────────────────── */}
          {spendingCategories.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>📊 Spending Breakdown</span>
              </div>
              <div style={styles.spendingGrid}>
                <div>
                  {spendingCategories.slice(0, 7).map((cat, i) => {
                    const catTotal = Number(cat.total || 0);
                    const pct = totalSent > 0 ? ((catTotal / totalSent) * 100).toFixed(0) : 0;
                    const color = PROVIDER_COLORS[cat.category?.toLowerCase()] ||
                      ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#e056a0', '#00b894'][i % 7];
                    return (
                      <div key={i} style={styles.spendingRow}>
                        <div style={styles.spendingLabel}>
                          <span style={{ ...styles.spendingDot, background: color }} />
                          {cat.category}
                        </div>
                        <div style={styles.spendingAmount}>NLe {catTotal.toLocaleString()}</div>
                        <div style={styles.spendingBar}>
                          <div style={{ ...styles.spendingBarFill, width: `${pct}%`, background: color }} />
                        </div>
                        <div style={styles.spendingPct}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Savings Goals ─────────────────────────────────────── */}
          {goals.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>🎯 Savings Goals</span>
              </div>
              <div style={styles.goalsGrid}>
                {goals.slice(0, 3).map((goal, i) => {
                  const progress = Math.round((Number(goal.current_amount || 0) / Number(goal.target_amount)) * 100);
                  const remaining = Number(goal.target_amount) - Number(goal.current_amount || 0);
                  return (
                    <div key={i} style={styles.goalCard}>
                      <div style={styles.goalTop}>
                        <div style={styles.goalName}>{goal.name}</div>
                        <div style={styles.goalProgress}>{progress}%</div>
                      </div>
                      <div style={styles.goalBar}>
                        <div style={{ ...styles.goalBarFill, width: `${Math.min(100, progress)}%` }} />
                      </div>
                      <div style={styles.goalMeta}>
                        <span>NLe {Number(goal.current_amount || 0).toLocaleString()} saved</span>
                        <span>NLe {remaining.toLocaleString()} remaining</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Budget Overview ───────────────────────────────────── */}
          {budget && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>📋 Budget Overview</span>
              </div>
              <div style={styles.budgetGrid}>
                <div style={styles.budgetCard}>
                  <div style={styles.budgetLabel}>Recommended Monthly Savings</div>
                  <div style={styles.budgetValue}>NLe {(budget.recommended_monthly_savings || 0).toLocaleString()}</div>
                </div>
                <div style={styles.budgetCard}>
                  <div style={styles.budgetLabel}>Current Savings Rate</div>
                  <div style={styles.budgetValue}>{budget.current_savings_rate || 0}%</div>
                </div>
                <div style={styles.budgetCard}>
                  <div style={styles.budgetLabel}>Emergency Fund Target</div>
                  <div style={styles.budgetValue}>NLe {(budget.emergency_fund_target || 0).toLocaleString()}</div>
                  <div style={styles.budgetSub}>{budget.emergency_fund_progress || 0}% saved</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── AI Chat ──────────────────────────────────────────────── */}
      <div style={styles.chatContainer}>
        <div style={styles.chatHeader}>
          <div>
            <div style={styles.chatTitle}>🤖 Smart Money Coach</div>
            <div style={styles.chatSubtitle}>Ask me anything about your finances</div>
          </div>
          <button onClick={handleClearHistory} style={styles.clearBtn}>Clear Chat</button>
        </div>

        {!emptyState && (
          <div style={styles.suggestionsRow}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => handleSuggestion(s.text)} style={styles.suggestionBtn}>
                <span>{s.icon}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        )}

        <div style={styles.chatBox}>
          <div style={styles.chatMessages}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                ...styles.chatBubble,
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? '#1a6b3c' : 'white',
                color: msg.role === 'user' ? 'white' : '#333',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
              }}>
                {msg.text || msg.content}
              </div>
            ))}
            {sending && (
              <div style={{ ...styles.chatBubble, alignSelf: 'flex-start', background: '#f0f0f0', color: '#888' }}>
                Thinking...
              </div>
            )}
          </div>
          <form onSubmit={handleChat} style={styles.chatForm}>
            <input
              style={styles.chatInput}
              placeholder="Ask about your finances..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
            />
            <button type="submit" style={{
              ...styles.sendBtn,
              opacity: sending || !chatInput.trim() ? 0.5 : 1,
            }} disabled={sending || !chatInput.trim()}>
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },

  // Empty State
  emptyState: {
    background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
    border: '1px solid #333', borderRadius: '16px',
    padding: '48px', textAlign: 'center', color: 'white', marginBottom: '24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  },

  // Health Score
  healthCard: {
    background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
    border: '1px solid #333', borderRadius: '16px',
    padding: '24px', marginBottom: '20px', color: 'white',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  },
  healthRow: { display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' },
  healthDonut: { flexShrink: 0 },
  donutOuter: {
    width: '110px', height: '110px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
  },
  donutInner: {
    width: '88px', height: '88px', borderRadius: '50%', background: '#1a1a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
  },
  donutScore: { fontSize: '28px', fontWeight: 700 },
  donutMax: { fontSize: '10px', color: '#888' },
  healthText: { flex: 1, minWidth: '200px' },
  healthTitle: { fontSize: '20px', fontWeight: 600, marginBottom: '6px' },
  healthLabel: { fontSize: '14px', fontWeight: 500, marginBottom: '10px' },
  healthDesc: { fontSize: '13px', color: '#aaa', lineHeight: '1.5' },

  // Sections
  section: { marginBottom: '20px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  sectionTitle: { fontSize: '16px', fontWeight: 600, color: '#1a1a1a' },
  sectionBadge: { fontSize: '12px', color: '#888', background: '#f0f0f0', padding: '4px 10px', borderRadius: '12px' },

  // Overview Cards
  overviewCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' },
  overviewCard: {
    background: 'white', borderRadius: '12px', padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #eee', textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  overviewCardIcon: { fontSize: '24px', marginBottom: '6px' },
  overviewCardLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  overviewCardValue: { fontSize: '18px', fontWeight: 600 },

  // Wallet Section
  walletSection: { marginBottom: '20px' },
  walletGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  walletCard: {
    background: 'white', borderRadius: '12px', padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #eee',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  walletCardTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  walletIcon: {
    width: '36px', height: '36px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', fontWeight: 600, color: 'white', flexShrink: 0
  },
  walletName: { fontSize: '14px', fontWeight: 600 },
  walletProvider: { fontSize: '11px', color: '#888' },
  walletBalance: { fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#1a1a1a' },
  walletBar: { height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' },
  walletBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.5s' },
  walletPct: { fontSize: '11px', color: '#888' },

  // Insight Banner
  insightBanner: {
    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', border: '1px solid #e0e0e0', borderRadius: '10px',
    padding: '14px 18px', marginBottom: '20px', fontSize: '14px', color: '#333',
    display: 'flex', alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },

  // Insights List
  insightsList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  insightItem: {
    background: 'white', borderRadius: '10px', padding: '14px 16px',
    border: '1px solid #eee', borderLeft: '4px solid #4ecdc4',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    transition: 'transform 0.2s'
  },
  insightTitle: { fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#1a1a1a' },
  insightMessage: { fontSize: '12px', color: '#666', lineHeight: '1.5' },

  // Spending
  spendingGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '0px' },
  spendingRow: {
    display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px',
    padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '13px'
  },
  spendingLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 },
  spendingDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  spendingAmount: { fontWeight: 600, color: '#1a1a1a', gridColumn: '2', gridRow: '1 / 3', alignSelf: 'center' },
  spendingBar: { height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', gridColumn: '1' },
  spendingBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.5s' },
  spendingPct: { fontSize: '11px', color: '#888', gridColumn: '1' },

  // Goals
  goalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' },
  goalCard: {
    background: 'white', borderRadius: '12px', padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #eee',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  goalTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  goalName: { fontSize: '14px', fontWeight: 600 },
  goalProgress: { fontSize: '14px', fontWeight: 700, color: '#1a6b3c' },
  goalBar: { height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' },
  goalBarFill: {
    height: '100%', borderRadius: '4px',
    background: 'linear-gradient(90deg, #1a6b3c, #7edeab)', transition: 'width 0.5s'
  },
  goalMeta: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' },

  // Budget
  budgetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' },
  budgetCard: {
    background: 'white', borderRadius: '10px', padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #eee', textAlign: 'center',
    transition: 'transform 0.2s'
  },
  budgetLabel: { fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' },
  budgetValue: { fontSize: '18px', fontWeight: 600, color: '#1a1a1a' },
  budgetSub: { fontSize: '11px', color: '#1a6b3c', marginTop: '4px' },

  // Chat
  chatContainer: {
    background: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%)',
    borderRadius: '16px', padding: '20px', border: '1px solid #333', marginTop: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  },
  chatHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  chatTitle: { fontSize: '16px', fontWeight: 600, color: 'white' },
  chatSubtitle: { fontSize: '12px', color: '#aaa' },
  clearBtn: {
    padding: '6px 14px', background: 'transparent', color: '#aaa',
    border: '1px solid #444', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
  },

  // Suggestions
  suggestionsRow: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' },
  suggestionBtn: {
    padding: '8px 14px', background: '#333', border: '1px solid #444',
    borderRadius: '20px', fontSize: '12px', color: '#ddd', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
    ':hover': {
      background: '#444', transform: 'translateY(-2px)'
    }
  },

  // Chat Box
  chatBox: {
    background: '#fafafa', borderRadius: '12px', border: '1px solid #eee',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
  },
  chatMessages: {
    flex: 1, minHeight: '320px', maxHeight: '520px', overflowY: 'auto',
    padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px'
  },
  chatBubble: {
    maxWidth: '82%', padding: '12px 16px', borderRadius: '16px',
    fontSize: '14px', lineHeight: '1.6', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    animation: 'fadeIn 0.3s ease-in'
  },
  chatForm: { display: 'flex', gap: '10px', padding: '14px', borderTop: '1px solid #eee' },
  chatInput: {
    flex: 1, padding: '14px 18px', border: '2px solid #e0e0e0', borderRadius: '12px',
    fontSize: '14px', outline: 'none', background: 'white'
  },
  sendBtn: {
    padding: '14px 28px', background: '#1a6b3c', color: 'white',
    border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'all 0.2s',
    ':hover': {
      background: '#155a32', transform: 'translateY(-1px)'
    }
  },
};

export { styles };
