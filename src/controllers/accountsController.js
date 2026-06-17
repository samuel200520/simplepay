const db = require('../db');

exports.getAccounts = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      'SELECT * FROM linked_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );
    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Could not fetch linked accounts' });
  }
};

exports.linkAccount = async (req, res) => {
  const userId = req.user.userId;
  const { provider_id, account_number, account_name } = req.body;

  if (!provider_id || !account_number) {
    return res.status(400).json({ error: 'Provider and account number are required' });
  }

  try {
    const existing = await db.query(
      'SELECT id FROM linked_accounts WHERE user_id = $1 AND provider_id = $2 AND account_number = $3',
      [userId, provider_id, account_number]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This account is already linked' });
    }

    const result = await db.query(
      `INSERT INTO linked_accounts (user_id, provider_id, account_number, account_name, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [userId, provider_id, account_number, account_name || null]
    );

    res.status(201).json({ account: result.rows[0] });
  } catch (err) {
    console.error('Link account error:', err);
    res.status(500).json({ error: 'Could not link account' });
  }
};

exports.unlinkAccount = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE linked_accounts SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Unlink account error:', err);
    res.status(500).json({ error: 'Could not unlink account' });
  }
};