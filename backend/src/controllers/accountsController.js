const db = require('../db');

const providerPrefixes = {
  orange: ['072', '073', '074', '075', '076', '078', '079'],
  africell: ['030', '033', '080', '088', '090', '077', '099'],
  qmoney: ['032', '031', '034'],
};

function mapProviderToWalletName(providerId, accountNumber) {
  const p = String(providerId || '').toLowerCase();
  const readable = p.charAt(0).toUpperCase() + p.slice(1);
  return `${readable} Wallet`;
}

function getCleanPrefix(number) {
  const digits = number.replace(/\D/g, '');
  const local = digits.startsWith('232') ? '0' + digits.slice(3) : digits;
  return local.slice(0, 3);
}

exports.getAccounts = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      'SELECT * FROM linked_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );
    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Could not fetch linked accounts' });
  }
};

exports.linkAccount = async (req, res) => {
  const userId = req.user.userId;
  const { provider_id, account_number, account_name } = req.body;

  if (!provider_id || !account_number) {
    return res.status(400).json({ error: 'Provider and account number are required' });
  }

  if (providerPrefixes[provider_id]) {
    const prefix = getCleanPrefix(account_number);
    if (!providerPrefixes[provider_id].includes(prefix)) {
      return res.status(400).json({
        error: `This number doesn't match a valid prefix for this provider`
      });
    }
  }

  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if already exists in linked_accounts (legacy)
    const existingLegacy = await client.query(
      'SELECT id FROM linked_accounts WHERE user_id = $1 AND provider_id = $2 AND account_number = $3',
      [userId, provider_id, account_number]
    );

    if (existingLegacy.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This account is already linked' });
    }

    // Generate wallet name
    const walletName = account_name || mapProviderToWalletName(provider_id, account_number);

    // Insert into linked_accounts (legacy table for backward compatibility)
    const legacyResult = await client.query(
      `INSERT INTO linked_accounts (user_id, provider_id, account_number, account_name, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [userId, provider_id, account_number, walletName]
    );

    // Try to insert into linked_wallets (new table for multi-wallet support)
    // If table doesn't exist yet, that's okay — we fall back to linked_accounts
    const hasLinkedWallets = await db.getTableExists('linked_wallets');
    let linkedWalletId = legacyResult.rows[0].id;
    if (hasLinkedWallets) {
      try {
        const newResult = await client.query(
          `INSERT INTO linked_wallets (user_id, provider_id, account_number, account_name, wallet_name, is_active)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
          [userId, provider_id, account_number, walletName, walletName]
        );
        linkedWalletId = newResult.rows[0].id;
      } catch (err) {
        console.error('linked_wallets insert failed (non-critical):', err.message);
      }
    }

    // Create initial wallet_balance entry if table exists
    const hasWalletBalances = await db.getTableExists('wallet_balances');
    if (hasWalletBalances) {
      try {
        await client.query(
          `INSERT INTO wallet_balances (linked_wallet_id, balance, currency, last_sync)
           VALUES ($1, 0, 'SLE', NOW())
           ON CONFLICT (linked_wallet_id) DO NOTHING`,
          [linkedWalletId]
        );
      } catch (err) {
        console.error('wallet_balances insert failed (non-critical):', err.message);
      }
    }

    await client.query('COMMIT');

    // Return the legacy account format for frontend compatibility
    res.status(201).json({ account: legacyResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Link account error:', err);
    res.status(500).json({ error: 'Could not link account' });
  } finally {
    client.release();
  }
};

exports.unlinkAccount = async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Soft delete in linked_accounts (legacy)
    await client.query(
      'UPDATE linked_accounts SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    // Soft delete in linked_wallets (new) - match by user_id and id
    const hasLinkedWallets = await db.getTableExists('linked_wallets');
    if (hasLinkedWallets) {
      try {
        await client.query(
          `UPDATE linked_wallets SET is_active = false 
           WHERE user_id = $1 AND id = $2`,
          [userId, id]
        );
      } catch (err) {
        console.error('linked_wallets update failed (non-critical):', err.message);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Unlink account error:', err);
    res.status(500).json({ error: 'Could not unlink account' });
  } finally {
    client.release();
  }
};
