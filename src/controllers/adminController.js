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