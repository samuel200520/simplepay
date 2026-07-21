import React, { useState, useEffect } from 'react';
import client from '../api/client';

const PURPOSE_OPTIONS = [
  'Food', 'Transport', 'School Fees', 'Rent', 'Medical',
  'Business', 'Family Support', 'Shopping', 'Gift', 'Utilities', 'Investment', 'Other'
];

const ICONS = {
  'Food': '🍔', 'Transport': '🚗', 'School Fees': '🎓', 'Rent': '🏠', 'Medical': '💊',
  'Business': '💼', 'Family Support': '👨‍👩‍👧', 'Shopping': '🛍️', 'Gift': '🎁', 'Utilities': '💡', 'Investment': '📈', 'Other': '📝'
};

export default function SmartMoneyCoach({ initialData }) {
  const [insights, setInsights] = useState(initialData || null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hello! I\'m your Smart Money Coach. Ask me anything about your finances.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (!initialData) {
      loadInsights();
    }
  }, [initialData]);

  const loadInsights = async () => {
    try {
      const res = await client.get('/insights/insights');
      setInsights(res.data);
    } catch (err) {
      console.error('Load insights error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    try {
      const res = await client.get('/insights/insights');
      setInsights(res.data);
    } catch (err) {
      console.error('Load insights error:', err);
    } finally {
      setLoading(false);
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
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I couldn\'t process your request. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading insights...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Financial Health Score</h2>
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', textAlign: 'center'
        }}>
          <div style={{
            width: '120px', height: '120px', borderRadius: '50%',
            background: `conic-gradient(#1a6b3c ${insights?.health_score || 0}%, #e0e0e0 ${insights?.health_score || 0}%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              background: 'white', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column'
            }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a6b3c' }}>
                {insights?.health_score || 0}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>/ 100</div>
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#555', marginBottom: '12px' }}>
            {insights?.health_score >= 80 ? 'Excellent financial health!' : 
             insights?.health_score >= 60 ? 'Good progress, keep improving!' : 
             'Room for improvement. Let\'s work on it!'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Wallet Balance</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>NLe {Number(insights?.total_received || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Monthly Expenses</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>NLe {Number(insights?.total_spent || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Money Saved</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#1a6b3c' }}>NLe {Number(insights?.total_saved || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Savings Goals</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>{insights?.goals?.length || 0} active</div>
        </div>
      </div>

      {insights?.insights?.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Latest AI Insight</h3>
          {insights.insights.slice(0, 3).map((insight, i) => (
            <div key={i} style={{
              background: insight.type === 'warning' ? '#fff4e5' : insight.type === 'success' ? '#e6f7ed' : '#f5f5f5',
              border: `1px solid ${insight.type === 'warning' ? '#ffd699' : insight.type === 'success' ? '#a8dfc0' : '#ddd'}`,
              borderRadius: '12px', padding: '16px', marginBottom: '12px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: insight.type === 'warning' ? '#b87800' : insight.type === 'success' ? '#1a6b3c' : '#333' }}>
                {insight.title}
              </div>
              <div style={{ fontSize: '13px', color: '#555' }}>{insight.message}</div>
            </div>
          ))}
        </div>
      )}

      {insights?.spending_breakdown?.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Spending Breakdown</h3>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            {insights.spending_breakdown.map((cat, i) => {
              const total = insights.spending_breakdown.reduce((sum, c) => sum + Number(c.total), 0);
              const pct = total > 0 ? (Number(cat.total) / total) * 100 : 0;
              return (
                <div key={i} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>{ICONS[cat.category] || '📝'} {cat.category}</span>
                    <span style={{ fontWeight: 500 }}>NLe {Number(cat.total).toLocaleString()}</span>
                  </div>
                  <div style={{ height: '6px', background: '#e0e0e0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#1a6b3c', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>AI Chat</h3>
        <div style={{
          background: 'white', borderRadius: '12px', padding: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', height: '300px',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: '8px', padding: '10px 14px', borderRadius: '12px',
                background: msg.role === 'user' ? '#1a6b3c' : '#f5f5f5',
                color: msg.role === 'user' ? 'white' : '#333',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%', marginLeft: msg.role === 'user' ? 'auto' : '0'
              }}>
                {msg.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleChat} style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              placeholder="Ask about your finances..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
            />
            <button type="submit" style={{
              padding: '10px 20px', background: '#1a6b3c', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
            }} disabled={sending}>
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
