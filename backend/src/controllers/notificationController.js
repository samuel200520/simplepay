const db = require('../db');

exports.getNotifications = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Could not fetch notifications' });
  }
};

exports.createNotification = async (userId, type, message, data = {}) => {
  try {
    await db.query(
      'INSERT INTO notifications (user_id, type, message, data) VALUES ($1, $2, $3, $4)',
      [userId, type, message, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Create notification error:', err);
  }
};

exports.markAsRead = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await db.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ error: 'Could not update notification' });
  }
};

exports.markAllAsRead = async (req, res) => {
  const userId = req.user.userId;

  try {
    await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all as read error:', err);
    res.status(500).json({ error: 'Could not update notifications' });
  }
};
