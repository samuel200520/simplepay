const db = require('../db');
const { sendToProvider } = require('../providers');
const { v4: uuidv4 } = require('uuid');

exports.sendMoney = async (req, res) => {
  const { from_provider, to_provider, recipient, amount, note } = req.body;
  const userId = req.user.userId;

  if (!from_provider || !to_provider || !recipient || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (amount < 5) {
    return res.status(400).json({ error: 'Minimum transfer amount is NLe 5' });
  }
  const fee = Math.round(amount * 0.005);
  const totalDeducted = amount + fee;

  try {
    const walletResult = await db.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = walletResult.rows[0];
    if (wallet.balance < totalDeducted) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const reference = 'SMP-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();

    await db.query(
      `INSERT INTO transactions 
        (reference, sender_user_id, receiver_identifier, from_provider, to_provider, amount, fee, total_deducted, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')`,
      [reference, userId, recipient, from_provider, to_provider, amount, fee, totalDeducted, note || null]
    );

    await db.query(
      'UPDATE wallets SET balance = balance - $1 WHERE id = $2',
      [totalDeducted, wallet.id]
    );

    const providerResult = await sendToProvider(to_provider, recipient, amount);

    await db.query(
      "UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE reference = $1",
      [reference]
    );

    const newBalance = wallet.balance - totalDeducted;
    res.json({
      success: true,
      reference,
      amount,
      fee,
      total_deducted: totalDeducted,
      new_balance: newBalance,
      provider_reference: providerResult.providerReference,
      settled_at: providerResult.settledAt,
    });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: err.message || 'Transfer failed' });
  }
};

exports.getHistory = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      `SELECT * FROM transactions WHERE sender_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Could not fetch history' });
  }
};