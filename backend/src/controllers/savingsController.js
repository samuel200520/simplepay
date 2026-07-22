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
    let isLinkedSource = false;

    if (source_wallet_id) {
      if (String(source_wallet_id).startsWith('simplepay-')) {
        const walletRowId = String(source_wallet_id).split('-')[1];
        const w = await db.query('SELECT id, balance FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
        sourceWallet = w.rows[0];
      } else if (String(source_wallet_id).startsWith('linked-')) {
        const linkedWalletId = String(source_wallet_id).split('-')[1];
        const hasLinkedWallets = await db.getTableExists('linked_wallets');
        let actualLinkedWalletId = linkedWalletId;
        if (hasLinkedWallets) {
          try {
            const la = await db.query('SELECT provider_id, account_number FROM linked_accounts WHERE id = $1 AND user_id = $2', [linkedWalletId, userId]);
            if (la.rows.length > 0) {
              const lw = await db.query('SELECT id FROM linked_wallets WHERE user_id = $1 AND provider_id = $2 AND account_number = $3 AND is_active = true LIMIT 1', [userId, la.rows[0].provider_id, la.rows[0].account_number]);
              if (lw.rows.length > 0) actualLinkedWalletId = lw.rows[0].id;
            }
          } catch (err) {
            console.error('linked_wallets id lookup failed:', err.message);
          }
        }
        const hasWalletBalances = await db.getTableExists('wallet_balances');
        if (hasWalletBalances) {
          const balResult = await db.query(
            'SELECT balance FROM wallet_balances WHERE linked_wallet_id = $1',
            [actualLinkedWalletId]
          );
          const linkedBalance = Number(balResult.rows[0]?.balance || 0);
          if (linkedBalance < amount) {
            return res.status(400).json({ error: `Insufficient linked wallet balance (NLe ${linkedBalance.toLocaleString()})` });
          }
          isLinkedSource = true;
        }
      } else {
        return res.status(400).json({ error: 'Invalid source wallet' });
      }
    } else {
      const w = await db.query('SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      sourceWallet = w.rows[0];
    }

    if (!isLinkedSource && (!sourceWallet || sourceWallet.balance < amount)) {
      return res.status(400).json({ error: 'Insufficient balance in source wallet' });
    }

    const reference = 'SAV-' + Date.now().toString(36).toUpperCase();

    await db.query('BEGIN');

    if (isLinkedSource) {
      const linkedWalletId = String(source_wallet_id).split('-')[1];
      const hasLinkedWallets = await db.getTableExists('linked_wallets');
      let actualLinkedWalletId = linkedWalletId;
      if (hasLinkedWallets) {
        try {
          const la = await db.query('SELECT provider_id, account_number FROM linked_accounts WHERE id = $1 AND user_id = $2', [linkedWalletId, userId]);
          if (la.rows.length > 0) {
            const lw = await db.query('SELECT id FROM linked_wallets WHERE user_id = $1 AND provider_id = $2 AND account_number = $3 AND is_active = true LIMIT 1', [userId, la.rows[0].provider_id, la.rows[0].account_number]);
            if (lw.rows.length > 0) actualLinkedWalletId = lw.rows[0].id;
          }
        } catch (err) {
          console.error('linked_wallets id lookup failed:', err.message);
        }
      }
      const hasWalletBalances = await db.getTableExists('wallet_balances');
      if (hasWalletBalances) {
        await db.query(
          `INSERT INTO wallet_balances (linked_wallet_id, balance, currency, last_sync)
           VALUES ($1, 0 - $2, 'SLE', NOW())
           ON CONFLICT (linked_wallet_id) DO UPDATE SET balance = wallet_balances.balance + EXCLUDED.balance, last_sync = EXCLUDED.last_sync`,
          [actualLinkedWalletId, amount]
        );
      }
    } else {
      await db.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, sourceWallet.id]);
    }

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
        if (/^\d+$/.test(walletRowId)) {
          const w = await db.query('SELECT id, balance FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
          destWallet = w.rows[0];
        }
        if (!destWallet) {
          const fallback = await db.query('SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
          destWallet = fallback.rows[0];
        }
      } else if (String(destination_wallet_id).startsWith('linked-')) {
        const linkedWalletId = String(destination_wallet_id).split('-')[1];
        const hasLinkedWallets = await db.getTableExists('linked_wallets');
        let actualLinkedWalletId = linkedWalletId;
        if (hasLinkedWallets) {
          try {
            const la = await db.query('SELECT provider_id, account_number FROM linked_accounts WHERE id = $1 AND user_id = $2', [linkedWalletId, userId]);
            if (la.rows.length > 0) {
              const lw = await db.query('SELECT id FROM linked_wallets WHERE user_id = $1 AND provider_id = $2 AND account_number = $3 AND is_active = true LIMIT 1', [userId, la.rows[0].provider_id, la.rows[0].account_number]);
              if (lw.rows.length > 0) actualLinkedWalletId = lw.rows[0].id;
            }
          } catch (err) {
            console.error('linked_wallets id lookup failed:', err.message);
          }
        }
        const hasWalletBalances = await db.getTableExists('wallet_balances');
        if (hasWalletBalances) {
          const balResult = await db.query(
            'SELECT balance FROM wallet_balances WHERE linked_wallet_id = $1',
            [actualLinkedWalletId]
          );
          const linkedBalance = Number(balResult.rows[0]?.balance || 0);
          if (linkedBalance < amount) {
            return res.status(400).json({ error: `Insufficient linked wallet balance (NLe ${linkedBalance.toLocaleString()})` });
          }
          await db.query(
            `INSERT INTO wallet_balances (linked_wallet_id, balance, currency, last_sync)
             VALUES ($1, $2, 'SLE', NOW())
             ON CONFLICT (linked_wallet_id) DO UPDATE SET balance = wallet_balances.balance + EXCLUDED.balance, last_sync = EXCLUDED.last_sync`,
             [actualLinkedWalletId, amount]
          );
        }
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

exports.processAutoSave = async (userId, incomingAmount) => {
  try {
    const goals = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true AND auto_save_enabled = true AND auto_save_amount IS NOT NULL',
      [userId]
    );

    for (const goal of goals.rows) {
      const autoSaveAmount = Number(goal.auto_save_amount);
      if (goal.auto_save_frequency === 'percentage') {
        const saveAmount = (incomingAmount * autoSaveAmount) / 100;
        if (saveAmount < 1) continue;
        
        const swResult = await db.query('SELECT * FROM savings_wallets WHERE user_id = $1 AND goal_id = $2', [userId, goal.id]);
        const sw = swResult.rows[0];
        if (!sw) continue;

        const reference = 'AUTO-SAV-' + Date.now().toString(36).toUpperCase();
        await db.query('BEGIN');
        
        const newBalance = Number(sw.balance) + saveAmount;
        await db.query('UPDATE savings_wallets SET balance = $1 WHERE id = $2', [newBalance, sw.id]);
        
        await db.query(
          'INSERT INTO savings_transactions (user_id, goal_id, savings_wallet_id, type, amount, balance_before, balance_after, reference, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [userId, goal.id, sw.id, 'deposit', saveAmount, sw.balance, newBalance, reference, 'Auto-save']
        );
        
        await db.query('COMMIT');
      } else if (goal.auto_save_frequency === 'monthly' || goal.auto_save_frequency === 'weekly') {
        const lastAutoSave = await db.query(
          `SELECT created_at FROM savings_transactions 
           WHERE user_id = $1 AND goal_id = $2 AND note = 'Auto-save' 
           ORDER BY created_at DESC LIMIT 1`,
          [userId, goal.id]
        );
        
        let shouldSave = false;
        if (lastAutoSave.rows.length === 0) {
          shouldSave = true;
        } else {
          const lastDate = new Date(lastAutoSave.rows[0].created_at);
          const now = new Date();
          const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
          if (goal.auto_save_frequency === 'weekly' && daysSince >= 7) shouldSave = true;
          if (goal.auto_save_frequency === 'monthly' && daysSince >= 30) shouldSave = true;
        }
        
        if (shouldSave && autoSaveAmount <= incomingAmount) {
          const swResult = await db.query('SELECT * FROM savings_wallets WHERE user_id = $1 AND goal_id = $2', [userId, goal.id]);
          const sw = swResult.rows[0];
          if (!sw) continue;

          const reference = 'AUTO-SAV-' + Date.now().toString(36).toUpperCase();
          await db.query('BEGIN');
          
          const newBalance = Number(sw.balance) + autoSaveAmount;
          await db.query('UPDATE savings_wallets SET balance = $1 WHERE id = $2', [newBalance, sw.id]);
          
          await db.query(
            'INSERT INTO savings_transactions (user_id, goal_id, savings_wallet_id, type, amount, balance_before, balance_after, reference, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [userId, goal.id, sw.id, 'deposit', autoSaveAmount, sw.balance, newBalance, reference, 'Auto-save']
          );
          
          await db.query('COMMIT');
        }
      }
    }
  } catch (err) {
    console.error('Auto-save error:', err);
  }
};
