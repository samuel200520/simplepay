require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./src/db');

const authRoutes = require('./src/routes/auth');
const transferRoutes = require('./src/routes/transfer');
const userRoutes = require('./src/routes/user');
const accountsRoutes = require('./src/routes/accounts');
const adminRoutes = require('./src/routes/admin');
const walletRoutes = require('./src/routes/wallets');
const walletTransferRoutes = require('./src/routes/walletTransfers');

async function runStartupMigrations() {
  try {
    const hasColumn = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'simplepay_account_number'`
    );
    if (hasColumn.rows.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN simplepay_account_number VARCHAR(50) UNIQUE`);
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_simplepay_account_number ON users(simplepay_account_number)`);
      console.log('Added simplepay_account_number column to users');
    }

    const missingAccountUsers = await db.query(`SELECT id FROM users WHERE simplepay_account_number IS NULL LIMIT 100`);
    for (const row of missingAccountUsers.rows) {
      let accountNumber = 'SP-' + Math.floor(10000000 + Math.random() * 90000000);
      let exists = true;
      while (exists) {
        const check = await db.query('SELECT id FROM users WHERE simplepay_account_number = $1', [accountNumber]);
        if (check.rows.length === 0) {
          exists = false;
        } else {
          accountNumber = 'SP-' + Math.floor(10000000 + Math.random() * 90000000);
        }
      }
      await db.query('UPDATE users SET simplepay_account_number = $1 WHERE id = $2', [accountNumber, row.id]);
    }
    if (missingAccountUsers.rows.length > 0) {
      console.log(`Generated SimplePay account numbers for ${missingAccountUsers.rows.length} users`);
    }
  } catch (err) {
    console.error('Startup migration error:', err);
  }
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/user', userRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/wallets', walletTransferRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'SimplePay API running', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

runStartupMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`SimplePay API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to run startup migrations:', err);
  app.listen(PORT, () => {
    console.log(`SimplePay API running on http://localhost:${PORT}`);
  });
});