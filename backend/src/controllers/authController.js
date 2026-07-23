const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

function generateSimplePayAccountNumber() {
  const digits = Math.floor(10000000 + Math.random() * 90000000);
  return `SP-${digits}`;
}

exports.register = async (req, res) => {
  const { full_name, phone, email, password } = req.body;

  try {
    const existing = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await db.query(
      'INSERT INTO users (full_name, phone, email, password_hash, is_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, phone',
      [full_name, phone, email, password_hash, true]
    );
    const user = userResult.rows[0];

    await db.query(
      'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
      [user.id, 2000]
    );

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, full_name: user.full_name, phone: user.phone },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const result = await db.query(
      'SELECT id, full_name, phone, password_hash FROM users WHERE phone = $1',
      [phone]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, full_name: user.full_name, phone: user.phone },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Forgot password - sends a reset OTP (currently hardcoded to 1234)
exports.forgotPassword = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    // Check if user exists
    const result = await db.query('SELECT id, full_name FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      // Don't reveal whether the phone exists for security
      return res.json({ message: 'If the phone number is registered, a reset code will be sent' });
    }

    // In production, send the OTP via SMS gateway
    // For now, the OTP is hardcoded as 1234
    console.log(`Password reset requested for phone: ${phone} (user ID: ${result.rows[0].id})`);

    res.json({
      message: 'If the phone number is registered, a reset code will be sent',
      // DEV NOTE: Remove the debug_otp field in production!
      debug_otp: '1234',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error processing your request' });
  }
};

// Reset password - verifies OTP and updates password
exports.resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  if (!phone || !otp || !newPassword) {
    return res.status(400).json({ error: 'Phone, OTP, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // DEV NOTE: In production, verify OTP against stored hashed token in password_resets table
    if (otp !== '1234') {
      return res.status(401).json({ error: 'Invalid or expired reset code' });
    }

    // Find user
    const result = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Hash new password and update
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, user.id]);

    console.log(`Password reset successful for user ID: ${user.id}`);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error resetting password' });
  }
};
