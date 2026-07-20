const db = require('../db');
const { providers } = require('../providers');
const bcrypt = require('bcryptjs');

exports.getProfile = async (req, res) => {
  const userId = req.user.userId;
  try {
    const userResult = await db.query(
      'SELECT id, full_name, phone, email, is_verified, kyc_status, has_custom_pin, simplepay_account_number, created_at FROM users WHERE id = $1',
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

exports.setPin = async (req, res) => {
  const userId = req.user.userId;
  const { pin, currentPin } = req.body;

  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  try {
    const result = await db.query('SELECT transaction_pin, has_custom_pin FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (user && user.has_custom_pin && user.transaction_pin) {
      if (!currentPin) {
        return res.status(400).json({ error: 'Current PIN is required to change PIN' });
      }
      const valid = await bcrypt.compare(currentPin, user.transaction_pin);
      if (!valid) {
        return res.status(401).json({ error: 'WRONG_CURRENT_PIN', message: 'Current PIN is incorrect' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(pin, salt);
    await db.query('UPDATE users SET transaction_pin = $1, has_custom_pin = true WHERE id = $2', [pinHash, userId]);
    res.json({ success: true, message: 'Transaction PIN updated successfully' });
  } catch (err) {
    console.error('Set PIN error:', err);
    res.status(500).json({ error: 'Could not set PIN' });
  }
};

exports.verifyPin = async (req, res) => {
  const userId = req.user.userId;
  const { pin } = req.body;

  try {
    const result = await db.query('SELECT transaction_pin, has_custom_pin FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user || !user.transaction_pin) {
      if (pin === '1234') {
        return res.json({ success: true, demo: true, using_default: true });
      }
      return res.status(400).json({ error: 'NO_PIN', message: 'No transaction PIN set' });
    }

    if (!user.has_custom_pin && pin === '1234') {
      return res.json({ success: true, demo: true, using_default: true });
    }

    const valid = await bcrypt.compare(pin, user.transaction_pin);
    if (!valid) {
      return res.status(401).json({ error: 'WRONG_PIN', message: 'Incorrect PIN' });
    }

    res.json({ success: true, using_default: false });
  } catch (err) {
    console.error('Verify PIN error:', err);
    res.status(500).json({ error: 'Could not verify PIN' });
  }
};

exports.getPinStatus = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query('SELECT has_custom_pin, transaction_pin IS NOT NULL as pin_set FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    res.json({ has_custom_pin: !!user?.has_custom_pin, pin_set: !!user?.pin_set });
  } catch (err) {
    console.error('Get PIN status error:', err);
    res.status(500).json({ error: 'Could not fetch PIN status' });
  }
};