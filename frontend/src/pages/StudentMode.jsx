import React, { useState, useEffect } from 'react';
import client from '../api/client';

const CATEGORIES = [
  { id: 'school_fees', label: 'School Fees', icon: '🎓' },
  { id: 'hostel', label: 'Hostel Payment', icon: '🏠' },
  { id: 'printing', label: 'Campus Printing', icon: '🖨️' },
  { id: 'food', label: 'Campus Food', icon: '🍔' },
  { id: 'supplies', label: 'Supplies', icon: '📚' },
];

const DISCOUNTS = [
  { merchant: 'Campus Bookstore', discount: '10% off textbooks', code: 'STUDENT10' },
  { merchant: 'Student Transport', discount: '20% off bus fares', code: 'STUDENT20' },
  { merchant: 'Cafeteria', discount: '15% off meals', code: 'STUDENT15' },
];

export default function StudentMode({ initialProfile }) {
  const [profile, setProfile] = useState(initialProfile || null);
  const [hasProfile, setHasProfile] = useState(!!initialProfile);
  const [showSetup, setShowSetup] = useState(false);
  const [institution, setInstitution] = useState('');
  const [studentId, setStudentId] = useState('');
  const [level, setLevel] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const loadProfile = async () => {
    try {
      const res = await client.get('/student/profile');
      setHasProfile(!!res.data.profile);
      setProfile(res.data.profile);
    } catch (err) {
      console.error('Load profile error:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await client.get('/student/transactions');
      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.error('Load transactions error:', err);
    }
  };

  useEffect(() => {
    loadProfile();
    loadTransactions();
  }, []);

  const handleSetup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      await client.post('/student/profile', {
        institution_name: institution,
        student_id: studentId,
        level: level || null
      });
      setShowSetup(false);
      setMsg('Student profile created!');
      loadProfile();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Could not create profile');
    } finally {
      setLoading(false);
    }
  };

  const handleTransaction = async (e) => {
    e.preventDefault();
    if (!category || !amount) return;
    setLoading(true);
    setMsg('');
    try {
      await client.post('/student/transactions', {
        category,
        amount: parseFloat(amount),
        reference: reference || null
      });
      setAmount('');
      setReference('');
      setCategory('');
      setMsg('Transaction recorded!');
      loadTransactions();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Could not record transaction');
    } finally {
      setLoading(false);
    }
  };

  const totalByCategory = {};
  transactions.forEach(t => {
    totalByCategory[t.category] = (totalByCategory[t.category] || 0) + Number(t.amount);
  });

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Student Mode</h2>
          {!hasProfile && !showSetup && (
            <button onClick={() => setShowSetup(true)} style={{
              padding: '8px 16px', background: '#1a6b3c', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
            }}>
              Setup Student Profile
            </button>
          )}
        </div>

        {msg && <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', background: msg.includes('success') || msg.includes('created') ? '#e6f7ed' : '#fde8e8', color: msg.includes('success') || msg.includes('created') ? '#1a6b3c' : '#a32d2d', fontSize: '13px' }}>{msg}</div>}

        {showSetup && (
          <form onSubmit={handleSetup} style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Student Verification</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Institution Name</label>
              <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                placeholder="e.g., Fourah Bay College" value={institution} onChange={e => setInstitution(e.target.value)} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Student ID</label>
              <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                placeholder="e.g., FBC/2024/001" value={studentId} onChange={e => setStudentId(e.target.value)} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Level / Year</label>
              <select style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                value={level} onChange={e => setLevel(e.target.value)}>
                <option value="">Select level</option>
                <option value="100">Level 100</option>
                <option value="200">Level 200</option>
                <option value="300">Level 300</option>
                <option value="400">Level 400</option>
                <option value="postgraduate">Postgraduate</option>
              </select>
            </div>
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        )}

        {hasProfile && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '24px' }}>🎓</span>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{profile?.institution_name}</div>
                <div style={{ fontSize: '13px', color: '#888' }}>{profile?.student_id} {profile?.level ? `· Level ${profile.level}` : ''}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Quick Actions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{
                padding: '16px', background: '#f8f8f8', borderRadius: '10px',
                textAlign: 'center', cursor: 'pointer', border: '1px solid #eee'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{cat.icon}</div>
                <div style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>{cat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {DISCOUNTS.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Student Discounts</h3>
            {DISCOUNTS.map((d, i) => (
              <div key={i} style={{ padding: '12px', background: '#fff8e1', borderRadius: '8px', marginBottom: '8px', border: '1px solid #ffe082' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{d.merchant}</div>
                <div style={{ fontSize: '12px', color: '#b87800', marginBottom: '4px' }}>{d.discount}</div>
                <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>Code: {d.code}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Record Student Payment</h3>
        <form onSubmit={handleTransaction}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Category</label>
              <select style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Select category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Amount (NLe)</label>
              <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>Reference (optional)</label>
            <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              placeholder="Transaction reference" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a6b3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }} disabled={loading || !category || !amount}>
            {loading ? 'Saving...' : 'Record Payment'}
          </button>
        </form>
      </div>

      {transactions.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Payment History</h3>
          {CATEGORIES.map(cat => {
            const total = totalByCategory[cat.id] || 0;
            if (total === 0) return null;
            const count = transactions.filter(t => t.category === cat.id).length;
            return (
              <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{cat.icon} {cat.label}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{count} payment(s)</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>NLe {total.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
