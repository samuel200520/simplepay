const db = require('../db');

exports.getStudentProfile = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query('SELECT * FROM student_profiles WHERE user_id = $1', [userId]);
    res.json({ profile: result.rows[0] || null });
  } catch (err) {
    console.error('Get student profile error:', err);
    res.status(500).json({ error: 'Could not fetch student profile' });
  }
};

exports.createStudentProfile = async (req, res) => {
  const userId = req.user.userId;
  const { institution_name, student_id, level } = req.body;

  if (!institution_name || !student_id) {
    return res.status(400).json({ error: 'Institution name and student ID are required' });
  }

  try {
    await db.query(
      'INSERT INTO student_profiles (user_id, institution_name, student_id, level) VALUES ($1, $2, $3, $4)',
      [userId, institution_name, student_id, level || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Create student profile error:', err);
    res.status(500).json({ error: 'Could not create student profile' });
  }
};

exports.getStudentTransactions = async (req, res) => {
  const userId = req.user.userId;
  const { category } = req.query;
  try {
    let query = 'SELECT * FROM student_transactions WHERE user_id = $1';
    const params = [userId];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT 50';
    const result = await db.query(query, params);
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('Get student transactions error:', err);
    res.status(500).json({ error: 'Could not fetch student transactions' });
  }
};

exports.createStudentTransaction = async (req, res) => {
  const userId = req.user.userId;
  const { category, amount, reference, metadata } = req.body;

  if (!category || !amount) {
    return res.status(400).json({ error: 'Category and amount are required' });
  }

  try {
    const result = await db.query(
      'INSERT INTO student_transactions (user_id, category, amount, reference, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, category, amount, reference || null, metadata || null]
    );
    res.json({ transaction: result.rows[0] });
  } catch (err) {
    console.error('Create student transaction error:', err);
    res.status(500).json({ error: 'Could not create student transaction' });
  }
};
