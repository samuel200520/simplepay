-- SimplePay Multi-Wallet Schema Migration
-- This adds support for multiple wallets per user and proper ledger tracking

-- New table: linked_wallets (replaces/additional to linked_accounts)
CREATE TABLE IF NOT EXISTS linked_wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id VARCHAR(50) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  account_name VARCHAR(255),
  wallet_name VARCHAR(255),
  currency VARCHAR(3) DEFAULT 'SLE',
  is_active BOOLEAN DEFAULT true,
  balance DECIMAL(15, 2) DEFAULT 0.00,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider_id, account_number)
);

-- New table: wallet_balances (cached balances for external wallets)
CREATE TABLE IF NOT EXISTS wallet_balances (
  linked_wallet_id INTEGER PRIMARY KEY REFERENCES linked_wallets(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'SLE',
  last_sync TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- New table: wallet_transactions (proper ledger for all wallet movements)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  linked_wallet_id INTEGER REFERENCES linked_wallets(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'debit', 'credit', 'transfer_out', 'transfer_in', 'sync'
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
  from_linked_wallet_id INTEGER REFERENCES linked_wallets(id),
  to_linked_wallet_id INTEGER REFERENCES linked_wallets(id),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'reversed'
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_linked_wallets_user_id ON linked_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_wallets_provider_id ON linked_wallets(provider_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference);

-- Sync logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  linked_wallet_id INTEGER REFERENCES linked_wallets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
  balance_before DECIMAL(15, 2),
  balance_after DECIMAL(15, 2),
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_linked_wallet_id ON sync_logs(linked_wallet_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_linked_wallets_updated_at ON linked_wallets;
CREATE TRIGGER update_linked_wallets_updated_at
  BEFORE UPDATE ON linked_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallet_balances_updated_at ON wallet_balances;
CREATE TRIGGER update_wallet_balances_updated_at
  BEFORE UPDATE ON wallet_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();