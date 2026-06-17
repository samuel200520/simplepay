const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

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