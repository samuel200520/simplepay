const db = require('../db');
const { providers } = require('../providers');

exports.getProfile = async (req, res) => {
  const userId = req.user.userId;
  try {
    const userResult = await db.query(
      'SELECT id, full_name, phone, email, is_verified, kyc_status, created_at FROM users WHERE id = $1',
      [userId]
    );
    const walletResult = await db.query(
      'SELECT balance, currency FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: userResult.rows[0],
      wallet: walletResult.rows[0],
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Could not fetch profile' });
  }
};

exports.getProviders = async (req, res) => {
  res.json({ providers });
};

exports.getNetworkStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const statsResult = await db.query(
      `SELECT COUNT(*) as total_transactions, COALESCE(SUM(amount), 0) as total_volume
       FROM transactions WHERE created_at >= $1 AND status = 'completed'`,
      [today]
    );
    res.json({
      stats: {
        ...statsResult.rows[0],
        active_providers: providers.length,
        avg_settlement_ms: 1800,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Could not fetch stats' });
  }
};