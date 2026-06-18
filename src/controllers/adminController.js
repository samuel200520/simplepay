const db = require('../db');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }
  const token = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
};

exports.getOverview = async (req, res) => {
  try {
    const usersResult = await db.query('SELECT COUNT(*) as total_users FROM users');
    const txnResult = await db.query(
      `SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(fee), 0) as total_revenue
       FROM transactions WHERE status = 'completed'`
    );
    const reversedResult = await db.query(
      "SELECT COUNT(*) as total_reversed FROM transactions WHERE status = 'reversed'"
    );

    res.json({
      total_users: usersResult.rows[0].total_users,
      total_transactions: txnResult.rows[0].total_transactions,
      total_volume: txnResult.rows[0].total_volume,
      total_revenue: txnResult.rows[0].total_revenue,
      total_reversed: reversedResult.rows[0].total_reversed,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Could not fetch overview' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.full_name, u.phone, u.email, u.created_at, w.balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Could not fetch users' });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, u.full_name as sender_name, u.phone as sender_phone
       FROM transactions t
       LEFT JOIN users u ON u.id = t.sender_user_id
       ORDER BY t.created_at DESC
       LIMIT 200`
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('Admin get transactions error:', err);
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
};

exports.reverseTransaction = async (req, res) => {
  const { reference } = req.params;
  try {
    const txnResult = await db.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
    if (txnResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const txn = txnResult.rows[0];

    if (txn.status === 'reversed') {
      return res.status(400).json({ error: 'Transaction already reversed' });
    }

    if (txn.fee > 0) {
      await db.query(
        'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
        [txn.total_deducted, txn.sender_user_id]
      );
    } else {
      await db.query(
        'UPDATE wallets SET balance = balance - $1 WHERE user_id = $2',
        [txn.amount, txn.sender_user_id]
      );
    }

    await db.query(
      "UPDATE transactions SET status = 'reversed' WHERE reference = $1",
      [reference]
    );

    res.json({ success: true, message: 'Transaction reversed successfully' });
  } catch (err) {
    console.error('Reverse transaction error:', err);
    res.status(500).json({ error: 'Could not reverse transaction' });
  }
};