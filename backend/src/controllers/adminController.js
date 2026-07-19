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
    const walletResult = await db.query(
      `SELECT COALESCE(SUM(balance), 0) as total_wallet_balance, COUNT(*) as total_wallets
       FROM wallets`
    );
    const linkedResult = await db.query(
      `SELECT COUNT(*) as total_linked_accounts FROM linked_accounts WHERE is_active = true`
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayResult = await db.query(
      `SELECT 
        COUNT(*) as today_transactions,
        COALESCE(SUM(amount), 0) as today_volume,
        COALESCE(SUM(fee), 0) as today_revenue
       FROM transactions WHERE created_at >= $1 AND status = 'completed'`,
      [today]
    );

    res.json({
      total_users: usersResult.rows[0].total_users,
      total_transactions: txnResult.rows[0].total_transactions,
      total_volume: txnResult.rows[0].total_volume,
      total_revenue: txnResult.rows[0].total_revenue,
      total_reversed: reversedResult.rows[0].total_reversed,
      total_wallet_balance: walletResult.rows[0].total_wallet_balance,
      total_wallets: walletResult.rows[0].total_wallets,
      total_linked_accounts: linkedResult.rows[0].total_linked_accounts,
      today_transactions: todayResult.rows[0].today_transactions,
      today_volume: todayResult.rows[0].today_volume,
      today_revenue: todayResult.rows[0].today_revenue,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Could not fetch overview' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT u.id, u.full_name, u.phone, u.email, u.created_at, u.kyc_status, u.is_verified,
             w.balance, w.currency,
             COUNT(DISTINCT la.id) as linked_accounts_count
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN linked_accounts la ON la.user_id = u.id AND la.is_active = true
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` WHERE u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length}`;
    }
    query += ` GROUP BY u.id, w.balance, w.currency ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);
    
    const result = await db.query(query, params);
    const countResult = await db.query('SELECT COUNT(*) as total FROM users');
    
    res.json({ 
      users: result.rows, 
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Could not fetch users' });
  }
};

exports.getUserDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const userResult = await db.query(
      `SELECT u.id, u.full_name, u.phone, u.email, u.created_at, u.kyc_status, u.is_verified,
              w.balance, w.currency
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const linkedAccounts = await db.query(
      'SELECT * FROM linked_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [id]
    );

    const walletBalances = await db.query(
      `SELECT wb.balance, wb.currency, wb.last_sync, la.provider_id, la.account_number
       FROM wallet_balances wb
       JOIN linked_accounts la ON la.id = wb.linked_wallet_id
       WHERE la.user_id = $1`,
      [id]
    );

    const recentTxns = await db.query(
      `SELECT * FROM transactions 
       WHERE sender_user_id = $1 OR receiver_identifier = (
         SELECT simplepay_account_number FROM users WHERE id = $1
       )
       ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      user: userResult.rows[0],
      linked_accounts: linkedAccounts.rows,
      wallet_balances: walletBalances.rows,
      recent_transactions: recentTxns.rows,
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: 'Could not fetch user details' });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50, status = '', from_provider = '', to_provider = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT t.*, u.full_name as sender_name, u.phone as sender_phone
      FROM transactions t
      LEFT JOIN users u ON u.id = t.sender_user_id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (t.reference ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR t.receiver_identifier ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    if (from_provider) {
      params.push(from_provider);
      query += ` AND t.from_provider = $${params.length}`;
    }
    if (to_provider) {
      params.push(to_provider);
      query += ` AND t.to_provider = $${params.length}`;
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);
    
    const result = await db.query(query, params);
    const countResult = await db.query('SELECT COUNT(*) as total FROM transactions');
    
    res.json({ 
      transactions: result.rows, 
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Admin get transactions error:', err);
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
};

exports.getProviderStats = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        from_provider,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(fee), 0) as total_fee
       FROM transactions
       WHERE status = 'completed'
       GROUP BY from_provider
       ORDER BY total_volume DESC`
    );
    res.json({ providers: result.rows });
  } catch (err) {
    console.error('Admin provider stats error:', err);
    res.status(500).json({ error: 'Could not fetch provider stats' });
  }
};

exports.getDailyStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await db.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(fee), 0) as total_fee
       FROM transactions
       WHERE status = 'completed'
       AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );
    res.json({ daily_stats: result.rows });
  } catch (err) {
    console.error('Admin daily stats error:', err);
    res.status(500).json({ error: 'Could not fetch daily stats' });
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
