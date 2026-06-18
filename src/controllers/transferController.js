const db = require('../db');
const { sendToProvider } = require('../providers');
const { v4: uuidv4 } = require('uuid');

const providerPrefixes = {
  orange: ['072', '073', '074', '075', '076', '078', '079'],
  africell: ['030', '033', '080', '088', '090', '077', '099'],
  qmoney: ['032', '031', '034'],
};

function getCleanPrefix(number) {
  const digits = number.replace(/\D/g, '');
  const local = digits.startsWith('232') ? '0' + digits.slice(3) : digits;
  return local.slice(0, 3);
}

exports.sendMoney = async (req, res) => {
  const { from_provider, to_provider, recipient, amount, note } = req.body;
  const userId = req.user.userId;

  if (!from_provider || !to_provider || !recipient || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (amount < 5) {
    return res.status(400).json({ error: 'Minimum transfer amount is NLe 5' });
  }

  if (providerPrefixes[to_provider]) {
    const prefix = getCleanPrefix(recipient);
    if (!providerPrefixes[to_provider].includes(prefix)) {
      return res.status(400).json({ error: `This number doesn't match a valid ${to_provider} number` });
    }
  }

  function calculateFee(amount) {
    if (amount <= 50) return 1;
    if (amount <= 200) return 3;
    if (amount <= 500) return 7;
    if (amount <= 1000) return 12;
    return Math.round(amount * 0.01);
  }

  const fee = calculateFee(amount);
  const totalDeducted = amount + fee;

  try {
    const linkedCheck = await db.query(
      'SELECT id FROM linked_accounts WHERE user_id = $1 AND provider_id = $2 AND is_active = true',
      [userId, from_provider]
    );
    if (linkedCheck.rows.length === 0) {
      return res.status(400).json({ error: `You haven't linked a ${from_provider} account yet. Link it first in the Accounts tab.` });
    }

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

    const cleanRecipient = recipient.replace(/\D/g, '');
    const recipientAccount = await db.query(
      `SELECT la.user_id, w.id as wallet_id FROM linked_accounts la
       JOIN wallets w ON w.user_id = la.user_id
       WHERE la.provider_id = $1 AND la.account_number LIKE $2 AND la.is_active = true
       LIMIT 1`,
      [to_provider, '%' + cleanRecipient.slice(-9)]
    );

    let creditedInternally = false;
    if (recipientAccount.rows.length > 0) {
      await db.query(
        'UPDATE wallets SET balance = balance + $1 WHERE id = $2',
        [amount, recipientAccount.rows[0].wallet_id]
      );

      const senderResult = await db.query('SELECT full_name, phone FROM users WHERE id = $1', [userId]);
      const senderName = senderResult.rows[0]?.full_name || 'Someone';

      const incomingReference = 'SMP-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
      await db.query(
        `INSERT INTO transactions
          (reference, sender_user_id, receiver_identifier, from_provider, to_provider, amount, fee, total_deducted, note, status, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed', NOW())`,
        [incomingReference, recipientAccount.rows[0].user_id, senderName, from_provider, to_provider, amount, 0, amount, note || null]
      );

      creditedInternally = true;
    }

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
      credited_internally: creditedInternally,
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
      `SELECT *,
        CASE WHEN fee = 0 THEN 'received' ELSE 'sent' END as direction
       FROM transactions WHERE sender_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Could not fetch history' });
  }
};