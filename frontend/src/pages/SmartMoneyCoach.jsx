import React, { useState, useEffect } from 'react';
import client from '../api/client';

const CATEGORY_COLORS = {
  'Food': '#ff6b6b', 'Transport': '#4ecdc4', 'Rent': '#45b7d1', 'Shopping': '#f9ca24',
  'Business': '#6c5ce7', 'Medical': '#e056a0', 'Utilities': '#00b894', 'Family Support': '#fd79a8',
  'Entertainment': '#fdcb6e', 'Other': '#b2bec3'
};

const SUGGESTIONS = [
  { icon: '💰', text: 'How much did I spend this month?' },
  { icon: '📊', text: 'Show my biggest expenses' },
  { icon: '💡', text: 'Give me saving tips' },
  { icon: '🎯', text: 'How close am I to my goal?' },
  { icon: '📈', text: 'Create a monthly budget' },
  { icon: '🏦', text: 'Analyze my finances' },
];

export default function SmartMoneyCoach({ initialData }) {
  const [data, setData] = useState(initialData || null);
  const [budget, setBudget] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hello! I\'m your Smart Money Coach. I can see your wallet balance is NLe 0. Ask me about your spending, savings, or goals!' }
  ]);
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
        client.get('/insights/budget')
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
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: err.response?.data?.error || 'I couldn\'t process your request. Please try again.' 
      }]);
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

  const scoreColor = data?.health_score >= 80 ? '#1a6b3c' : data?.health_score >= 60 ? '#f9ca24' : '#e056a0';
  const scoreLabel = data?.health_score >= 80 ? 'Excellent' : data?.health_score >= 60 ? 'Good' : data?.health_score >= 40 ? 'Fair' : 'Needs Improvement';

  const emptyState = !data?.spending_breakdown?.length && !data?.total_spent;

  if (loading || !historyLoaded) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading your financial dashboard...</div>;
  }

  return (
    <div>
      {emptyState && (
        <div style={{
          background: 'linear-gradient(135deg, #1a6b3c 0%, #7edeab 100%)',
          borderRadius: '16px', padding: '40px', textAlign: 'center', color: 'white', marginBottom: '24px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏦</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Welcome to Smart Money Coach</div>
          <div style={{ fontSize: '14px', opacity: 0.9, maxWidth: '500px', margin: '0 auto' }}>
            Start using SimplePay to receive personalized financial insights. As your transaction history grows, your Smart Money Coach will provide more accurate recommendations.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {!emptyState && (
          <>
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{
                  width: '100px', height: '100px', borderRadius: '50%', flexShrink: 0,
                  background: `conic-gradient(${scoreColor} ${data?.health_score || 0}%, #e0e0e0 ${data?.health_score || 0}%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: scoreColor }}>{data?.health_score || 0}</div>
                    <div style={{ fontSize: '10px', color: '#888' }}>/ 100</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>Financial Health Score</div>
                  <div style={{ fontSize: '14px', color: scoreColor, fontWeight: 500, marginBottom: '8px' }}>{scoreLabel}</div>
                  <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
                    {data?.health_score >= 80 ? 'Excellent! You\'re managing your finances well. Keep maintaining these healthy habits.' : 
                     data?.health_score >= 60 ? 'Good progress! Focus on building your emergency fund and sticking to a budget.' : 
                     'There\'s room for improvement. Start tracking expenses, create savings goals, and try to reduce unnecessary spending.'}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!emptyState && (
          <>
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Wallet Balance</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>NLe {Number(data?.wallet_balance || budget?.current_balance || 0).toLocaleString()}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Monthly Income</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#1a6b3c' }}>NLe {Number(data?.monthly_income || budget?.monthly_income || 0).toLocaleString()}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Monthly Expenses</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#e056a0' }}>NLe {Number(data?.total_spent || budget?.monthly_expenses || 0).toLocaleString()}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Total Saved</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#00b894' }}>NLe {Number(data?.total_saved || 0).toLocaleString()}</div>
            </div>
          </>
        )}
      </div>

      {!emptyState && budget && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Budget Overview</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Personalized recommendations based on your spending</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Recommended Monthly Savings</div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#1a6b3c' }}>NLe {budget.recommended_monthly_savings?.toLocaleString() || 0}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Emergency Fund Target</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>NLe {budget.emergency_fund_target?.toLocaleString() || 0}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{budget.emergency_fund_progress || 0}% saved</div>
            </div>
            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Savings Rate</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{budget.current_savings_rate || 0}%</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>of income saved</div>
            </div>
            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Monthly Surplus</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: (budget.monthly_income || 0) > (budget.monthly_expenses || 0) ? '#1a6b3c' : '#e056a0' }}>
                NLe {Math.abs((budget.monthly_income || 0) - (budget.monthly_expenses || 0)).toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                {(budget.monthly_income || 0) > (budget.monthly_expenses || 0) ? 'Surplus' : 'Deficit'}
              </div>
            </div>
          </div>
          {budget.recommendations?.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Category Budget Recommendations</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {budget.recommendations.map((rec, i) => (
                  <div key={i} style={{ background: '#f5f5f5', borderRadius: '8px', padding: '12px', borderLeft: `3px solid ${CATEGORY_COLORS[rec.category] || '#b2bec3'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{rec.category}</div>
                      <div style={{ fontSize: '11px', color: '#888', background: 'white', padding: '2px 8px', borderRadius: '4px' }}>{rec.percentage}% of income</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#888' }}>Current: NLe {Number(rec.current).toLocaleString()}</span>
                      <span style={{ color: '#1a6b3c', fontWeight: 500 }}>Recommended: NLe {Number(rec.recommended).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.4' }}>{rec.suggestion}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!emptyState && data?.goals?.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Savings Goals</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {data.goals.slice(0, 3).map((goal, i) => {
              const progress = Math.round((Number(goal.current_amount || 0) / Number(goal.target_amount)) * 100);
              const remaining = Number(goal.target_amount) - Number(goal.current_amount || 0);
              return (
                <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{goal.name}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a6b3c' }}>{progress}%</div>
                  </div>
                  <div style={{ height: '8px', background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#1a6b3c', borderRadius: '4px', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: '#888' }}>NLe {Number(goal.current_amount || 0).toLocaleString()} saved</span>
                    <span style={{ color: '#888' }}>NLe {remaining.toLocaleString()} remaining</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!emptyState && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Send Money', icon: '📤', color: '#1a6b3c' },
              { label: 'Receive Money', icon: '📥', color: '#4ecdc4' },
              { label: 'Deposit to Savings', icon: '🎯', color: '#6c5ce7' },
              { label: 'Create Goal', icon: '✨', color: '#f9ca24' },
            ].map((action, i) => (
              <div key={i} style={{
                padding: '16px', background: '#f8f8f8', borderRadius: '10px',
                textAlign: 'center', cursor: 'pointer', border: '1px solid #eee',
                transition: 'all 0.2s'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{action.icon}</div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{action.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>AI Chat</h3>
          <button onClick={handleClearHistory} style={{
            padding: '6px 12px', background: 'transparent', color: '#888',
            border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
          }}>Clear Chat</button>
        </div>
        <div style={{
          background: 'white', borderRadius: '12px', padding: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column'
        }}>
          {!emptyState && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(s.text)}
                  style={{
                    padding: '8px 14px', background: '#f5f5f5', border: '1px solid #eee',
                    borderRadius: '20px', fontSize: '12px', color: '#555', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#1a6b3c'}
                  onMouseLeave={(e) => e.target.style.background = '#f5f5f5'}
                >
                  <span>{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{
            flex: 1, minHeight: '300px', maxHeight: '500px', overflowY: 'auto',
            marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px',
            padding: '12px', background: '#fafafa', borderRadius: '8px'
          }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '16px',
                background: msg.role === 'user' ? '#1a6b3c' : 'white',
                color: msg.role === 'user' ? 'white' : '#333',
                fontSize: '14px',
                lineHeight: '1.6',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}>
                {msg.text}
              </div>
            ))}
            {sending && (
              <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '16px', background: 'white', color: '#888', fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                Thinking...
              </div>
            )}
          </div>
          <form onSubmit={handleChat} style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ flex: 1, padding: '14px 18px', border: '2px solid #e0e0e0', borderRadius: '12px', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
              placeholder="Ask about your finances..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onFocus={(e) => e.target.style.borderColor = '#1a6b3c'}
              onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
            />
            <button type="submit" style={{
              padding: '14px 28px', background: '#1a6b3c', color: 'white',
              border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s'
            }} disabled={sending || !chatInput.trim()}>
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
