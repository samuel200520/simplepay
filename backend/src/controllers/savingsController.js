const db = require('../db');

exports.getGoals = async (req, res) => {
  const userId = req.user.userId;
  try {
    const goals = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );
    const wallets = await db.query(
      'SELECT sw.*, sg.name as goal_name FROM savings_wallets sw JOIN savings_goals sg ON sg.id = sw.goal_id WHERE sw.user_id = $1',
      [userId]
    );
    res.json({ goals: goals.rows, wallets: wallets.rows });
  } catch (err) {
    console.error('Get goals error:', err);
    res.status(500).json({ error: 'Could not fetch goals' });
  }
};

exports.createGoal = async (req, res) => {
  const userId = req.user.userId;
  const { name, target_amount, target_date, icon } = req.body;

  if (!name || !target_amount) {
    return res.status(400).json({ error: 'Name and target amount are required' });
  }

  try {
    const goalResult = await db.query(
      'INSERT INTO savings_goals (user_id, name, target_amount, target_date, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, name, target_amount, target_date || null, icon || null]
    );
    const goal = goalResult.rows[0];

    await db.query(
      'INSERT INTO savings_wallets (user_id, goal_id, balance) VALUES ($1, $2, 0)',
      [userId, goal.id]
    );

    res.json({ goal });
  } catch (err) {
    console.error('Create goal error:', err);
    res.status(500).json({ error: 'Could not create goal' });
  }
};

exports.updateGoal = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { name, target_amount, target_date, icon, auto_save_enabled, auto_save_amount, auto_save_frequency } = req.body;

  try {
    const result = await db.query(
      'UPDATE savings_goals SET name = $1, target_amount = $2, target_date = $3, icon = $4, auto_save_enabled = $5, auto_save_amount = $6, auto_save_frequency = $7 WHERE id = $8 AND user_id = $9 RETURNING *',
      [name, target_amount, target_date || null, icon || null, auto_save_enabled || false, auto_save_amount || null, auto_save_frequency || null, id, userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    res.json({ goal: result.rows[0] });
  } catch (err) {
    console.error('Update goal error:', err);
    res.status(500).json({ error: 'Could not update goal' });
  }
};

exports.deleteGoal = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await db.query('UPDATE savings_goals SET is_active = false WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete goal error:', err);
    res.status(500).json({ error: 'Could not delete goal' });
  }
};

exports.depositToGoal = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { amount, source_wallet_id } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const goalResult = await db.query('SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!goalResult.rows.length) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const swResult = await db.query('SELECT * FROM savings_wallets WHERE user_id = $1 AND goal_id = $2', [userId, id]);
    const sw = swResult.rows[0];

    let sourceWallet = null;
    if (source_wallet_id) {
      if (String(source_wallet_id).startsWith('simplepay-')) {
        const walletRowId = String(source_wallet_id).split('-')[1];
        const w = await db.query('SELECT id, balance FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
        sourceWallet = w.rows[0];
      } else {
        return res.status(400).json({ error: 'Invalid source wallet' });
      }
    } else {
      const w = await db.query('SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      sourceWallet = w.rows[0];
    }

    if (!sourceWallet || sourceWallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance in source wallet' });
    }

    const reference = 'SAV-' + Date.now().toString(36).toUpperCase();

    await db.query('BEGIN');

    await db.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, sourceWallet.id]);

    const newSavingsBalance = Number(sw.balance) + Number(amount);
    await db.query('UPDATE savings_wallets SET balance = $1 WHERE id = $2', [newSavingsBalance, sw.id]);

    await db.query(
      'INSERT INTO savings_transactions (user_id, goal_id, savings_wallet_id, type, amount, balance_before, balance_after, reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, id, sw.id, 'deposit', amount, sw.balance, newSavingsBalance, reference]
    );

    await db.query('COMMIT');

    res.json({ success: true, new_balance: newSavingsBalance, reference });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Deposit error:', err);
    res.status(500).json({ error: 'Could not deposit to goal' });
  }
};

exports.withdrawFromGoal = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { amount, destination_wallet_id } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const goalResult = await db.query('SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!goalResult.rows.length) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const swResult = await db.query('SELECT * FROM savings_wallets WHERE user_id = $1 AND goal_id = $2', [userId, id]);
    const sw = swResult.rows[0];

    if (Number(sw.balance) < amount) {
      return res.status(400).json({ error: 'Insufficient savings balance' });
    }

    let destWallet = null;
    if (destination_wallet_id) {
      if (String(destination_wallet_id).startsWith('simplepay-')) {
        const walletRowId = String(destination_wallet_id).split('-')[1];
        const w = await db.query('SELECT id, balance FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
        destWallet = w.rows[0];
      } else {
        return res.status(400).json({ error: 'Invalid destination wallet' });
      }
    } else {
      const w = await db.query('SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      destWallet = w.rows[0];
    }

    const reference = 'SAV-WD-' + Date.now().toString(36).toUpperCase();

    await db.query('BEGIN');

    const newSavingsBalance = Number(sw.balance) - Number(amount);
    await db.query('UPDATE savings_wallets SET balance = $1 WHERE id = $2', [newSavingsBalance, sw.id]);

    if (destWallet) {
      await db.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [amount, destWallet.id]);
    }

    await db.query(
      'INSERT INTO savings_transactions (user_id, goal_id, savings_wallet_id, type, amount, balance_before, balance_after, reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, id, sw.id, 'withdrawal', amount, sw.balance, newSavingsBalance, reference]
    );

    await db.query('COMMIT');

    res.json({ success: true, new_balance: newSavingsBalance, reference });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: 'Could not withdraw from goal' });
  }
};

exports.getSavingsHistory = async (req, res) => {
  const userId = req.user.userId;
  const { goalId } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM savings_transactions WHERE user_id = $1 AND goal_id = $2 ORDER BY created_at DESC LIMIT 50',
      [userId, goalId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('Savings history error:', err);
    res.status(500).json({ error: 'Could not fetch savings history' });
  }
};
