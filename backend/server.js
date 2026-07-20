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

    const hasPinColumn = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'has_custom_pin'`
    );
    if (hasPinColumn.rows.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN has_custom_pin BOOLEAN DEFAULT false`);
      console.log('Added has_custom_pin column to users');
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

    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existingTables = new Set(tables.rows.map(r => r.table_name));

    if (!existingTables.has('linked_wallets')) {
      await db.query(`CREATE TABLE linked_wallets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id VARCHAR(50) NOT NULL,
        account_number VARCHAR(100) NOT NULL,
        account_name VARCHAR(255),
        wallet_name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider_id, account_number)
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_linked_wallets_user_id ON linked_wallets(user_id)`);
      console.log('Created linked_wallets table');
    }

    if (!existingTables.has('wallet_balances')) {
      await db.query(`CREATE TABLE wallet_balances (
        id SERIAL PRIMARY KEY,
        linked_wallet_id INTEGER UNIQUE NOT NULL,
        balance DECIMAL(15, 2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'SLE',
        last_sync TIMESTAMP DEFAULT NOW()
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_balances_linked_wallet_id ON wallet_balances(linked_wallet_id)`);
      console.log('Created wallet_balances table');
    } else {
      await db.query(`ALTER TABLE wallet_balances DROP CONSTRAINT IF EXISTS wallet_balances_linked_wallet_id_fkey`);
    }

    if (!existingTables.has('wallet_transactions')) {
      await db.query(`CREATE TABLE wallet_transactions (
        id SERIAL PRIMARY KEY,
        wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        linked_wallet_id INTEGER,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'SLE',
        balance_before DECIMAL(15, 2),
        balance_after DECIMAL(15, 2),
        reference VARCHAR(100),
        provider_reference VARCHAR(255),
        from_provider VARCHAR(50),
        to_provider VARCHAR(50),
        from_wallet_id INTEGER REFERENCES wallets(id),
        to_wallet_id INTEGER REFERENCES wallets(id),
        from_linked_wallet_id INTEGER,
        to_linked_wallet_id INTEGER,
        status VARCHAR(50) DEFAULT 'completed',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference)`);
      console.log('Created wallet_transactions table');
    } else {
      await db.query(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_from_linked_wallet_id_fkey`);
      await db.query(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_to_linked_wallet_id_fkey`);
      await db.query(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_linked_wallet_id_fkey`);
      console.log('Dropped wallet_transactions FK constraints on linked wallet IDs');
    }

    if (!existingTables.has('sync_logs')) {
      await db.query(`CREATE TABLE sync_logs (
        id SERIAL PRIMARY KEY,
        linked_wallet_id INTEGER REFERENCES linked_wallets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'success',
        message TEXT,
        synced_at TIMESTAMP DEFAULT NOW()
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id)`);
      console.log('Created sync_logs table');
    } else {
      await db.query(`ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_linked_wallet_id_fkey`);
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