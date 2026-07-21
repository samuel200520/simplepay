import React, { useState, useEffect } from 'react';
import client from '../api/client';

const ICONS = {
  'School Fees': '🎓', 'Business': '💼', 'Rent': '🏠', 'Emergency': '🚨',
  'Vacation': '✈️', 'Car': '🚗', 'Wedding': '💍', 'Home': '🏡', 'custom': '📝'
};

export default function SavingsGoals({ initialData }) {
  const [goals, setGoals] = useState(initialData?.goals || []);
  const [wallets, setWallets] = useState(initialData?.wallets || []);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [icon, setIcon] = useState('');
  const [depositAmount, setDepositAmount] = useState({});
  const [withdrawAmount, setWithdrawAmount] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const loadGoals = async () => {
    try {
      const res = await client.get('/savings/goals');
      setGoals(res.data.goals || []);
      setWallets(res.data.wallets || []);
    } catch (err) {
      console.error('Load goals error:', err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !target) return;
    setLoading(true);
    setMsg('');
    try {
      await client.post('/savings/goals', {
        name,
        target_amount: parseFloat(target),
        target_date: date || null,
        icon: icon || null
      });
      setName('');
      setTarget('');
      setDate('');
      setIcon('');
      setShowCreate(false);
      setMsg('Goal created successfully!');
      loadGoals();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Could not create goal');
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (goalId) => {
    const amount = depositAmount[goalId];
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    setMsg('');
    try {
      await client.post(`/savings/goals/${goalId}/deposit`, {
        amount: parseFloat(amount),
        source_wallet_id: 'simplepay-main'
      });
      setDepositAmount(prev => ({ ...prev, [goalId]: '' }));
      setMsg('Deposit successful!');
      loadGoals();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Could not deposit');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (goalId) => {
    const amount = withdrawAmount[goalId];
    if (!amount || parseFloat(amount) <= 0) return;
    if (!window.confirm('You are about to withdraw from your savings goal. This will reduce your progress. Continue?')) return;
    setLoading(true);
    setMsg('');
    try {
      await client.post(`/savings/goals/${goalId}/withdraw`, {
        amount: parseFloat(amount),
        destination_wallet_id: 'simplepay-main'
      });
      setWithdrawAmount(prev => ({ ...prev, [goalId]: '' }));
      setMsg('Withdrawal successful!');
      loadGoals();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Could not withdraw');
    } finally {
      setLoading(false);
    }
  };

  const getGoalWallet = (goalId) => wallets.find(w => w.goal_id === goalId);
  const getProgress = (goal) => {
    const wallet = getGoalWallet(goal.id);
    const current = wallet ? Number(wallet.balance) : Number(goal.current_amount);
    return Math.min(100, Math.round((current / Number(goal.target_amount)) * 100));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Savings Goals</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '8px 16px', background: '#1a6b3c', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
        }}>
          {showCreate ? 'Cancel' : 'Create Goal'}
        </button>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', background: msg.includes('success') ? '#e6f7ed' : '#fde8e8', color: msg.includes('success') ? '#1a6b3c' : '#a32d2d', fontSize: '13px' }}>{msg}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Goal Name</label>
            <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              placeholder="e.g., School Fees" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Target Amount (NLe)</label>
              <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                type="number" placeholder="5000" value={target} onChange={e => setTarget(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Target Date (optional)</label>
              <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Icon</label>
            <select style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              value={icon} onChange={e => setIcon(e.target.value)}>
              <option value="">Select icon</option>
              {Object.keys(ICONS).map(k => (
                <option key={k} value={k}>{ICONS[k]} {k}</option>
              ))}
            </select>
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }} disabled={loading}>
            {loading ? 'Creating...' : 'Create Goal'}
          </button>
        </form>
      )}

      {goals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎯</div>
          <div style={{ fontSize: '14px' }}>No savings goals yet. Create your first goal to start saving!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {goals.map(goal => {
            const wallet = getGoalWallet(goal.id);
            const current = wallet ? Number(wallet.balance) : Number(goal.current_amount);
            const progress = getProgress(goal);
            const remaining = Number(goal.target_amount) - current;
            const pct = Math.min(100, (current / Number(goal.target_amount)) * 100);

            return (
              <div key={goal.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '32px' }}>{ICONS[goal.icon] || '🎯'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>{goal.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {goal.target_date ? `Target: ${new Date(goal.target_date).toLocaleDateString()}` : 'No target date'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: '#1a6b3c' }}>
                      {pct.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#888' }}>complete</div>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span>NLe {current.toLocaleString()} saved</span>
                    <span style={{ color: '#888' }}>NLe {remaining.toLocaleString()} remaining</span>
                  </div>
                  <div style={{ height: '10px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#1a6b3c', borderRadius: '5px', transition: 'width 0.3s' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    <input
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      type="number" placeholder="Amount" value={depositAmount[goal.id] || ''}
                      onChange={e => setDepositAmount(prev => ({ ...prev, [goal.id]: e.target.value }))}
                    />
                    <button onClick={() => handleDeposit(goal.id)} style={{
                      padding: '8px 12px', background: '#1a6b3c', color: 'white',
                      border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                    }} disabled={loading}>Deposit</button>
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    <input
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                      type="number" placeholder="Amount" value={withdrawAmount[goal.id] || ''}
                      onChange={e => setWithdrawAmount(prev => ({ ...prev, [goal.id]: e.target.value }))}
                    />
                    <button onClick={() => handleWithdraw(goal.id)} style={{
                      padding: '8px 12px', background: '#f5f5f5', color: '#666',
                      border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                    }} disabled={loading}>Withdraw</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
