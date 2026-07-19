const db = require('../db');
const { getAdapter } = require('../providers/adapters/registry');
const { v4: uuidv4 } = require('uuid');

function mapProviderToWalletName(providerId, accountNumber) {
  const p = String(providerId || '').toLowerCase();
  const readable = p.charAt(0).toUpperCase() + p.slice(1);
  return `${readable} Wallet`;
}

// TEMPORARY architecture mapping using existing tables:
// - wallets table => SimplePay wallet
// - linked_accounts => external wallets (placeholders)
// - balance sync writes to wallet_balances if table exists; otherwise returns simulated balance.
exports.getWalletCards = async (req, res) => {
  const userId = req.user.userId;

  try {
    // SimplePay wallet - create if doesn't exist
    let simplepayWalletResult = await db.query(
      'SELECT id, balance, currency FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [userId]
    );

    let simplepayWallet = simplepayWalletResult.rows[0];

    // Create SimplePay wallet with NLe 2000 if doesn't exist
    if (!simplepayWallet) {
      const newWallet = await db.query(
        'INSERT INTO wallets (user_id, balance, currency) VALUES ($1, 2000, $2) RETURNING *',
        [userId, 'SLE']
      );
      simplepayWallet = newWallet.rows[0];
    }

    // External linked accounts
    const linked = await db.query(
      'SELECT id, provider_id, account_number, account_name, is_active, created_at FROM linked_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );

    const cards = [];

    // Always add SimplePay wallet first
    cards.push({
      id: `simplepay-${simplepayWallet.id}`,
      provider: 'SimplePay',
      walletName: 'SimplePay Wallet',
      accountNumber: 'SIMPLEPAY',
      balance: Number(simplepayWallet.balance),
      currency: simplepayWallet.currency || 'SLE',
      status: 'Active',
      lastSync: null,
      _internal: { walletId: simplepayWallet.id },
    });

    // Add linked wallets
    for (const la of linked.rows) {
      const provider = la.provider_id;
      cards.push({
        id: `linked-${la.id}`,
        provider: provider,
        walletName: la.account_name || mapProviderToWalletName(provider, la.account_number),
        accountNumber: la.account_number,
        balance: 0, // Default balance for linked wallets
        currency: 'SLE',
        status: 'Linked',
        lastSync: null,
        _internal: { linkedAccountId: la.id },
      });
    }

    res.json({ wallets: cards });
  } catch (err) {
    console.error('getWalletCards error:', err);
    res.status(500).json({ error: 'Could not fetch wallets' });
  }
};

exports.syncWallet = async (req, res) => {
  const userId = req.user.userId;
  const { walletId } = req.params;

  try {
    // walletId format: simplepay-<walletRowId> or linked-<linkedAccountId>
    if (String(walletId).startsWith('simplepay-')) {
      // SimplePay balance is stored locally.
      const walletRowId = walletId.split('-')[1];
      const r = await db.query('SELECT id, balance, currency FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Wallet not found' });
      return res.json({ success: true, balance: Number(r.rows[0].balance), currency: r.rows[0].currency || 'SLE', syncedAt: new Date().toISOString() });
    }

    if (String(walletId).startsWith('linked-')) {
      const linkedAccountId = walletId.split('-')[1];
      const la = await db.query(
        'SELECT id, provider_id, account_number FROM linked_accounts WHERE id = $1 AND user_id = $2 AND is_active = true',
        [linkedAccountId, userId]
      );
      if (!la.rows.length) return res.status(404).json({ error: 'Wallet not found' });

      const { provider_id, account_number } = la.rows[0];
      const adapter = getAdapter(provider_id);
      const sync = await adapter.getBalance({ accountNumber: account_number, userId });

      // If wallet_balances exists, update it. Otherwise just return the synced value.
      // (We keep it resilient to missing tables.)
      try {
        await db.query(
          `INSERT INTO wallet_balances (linked_wallet_id, balance, currency, last_sync)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (linked_wallet_id) DO UPDATE
             SET balance = EXCLUDED.balance,
                 currency = EXCLUDED.currency,
                 last_sync = EXCLUDED.last_sync`,
          [linkedAccountId, sync.balance, sync.currency]
        );
      } catch {
        // ignore until schema is created
      }

      return res.json({
        success: true,
        balance: sync.balance,
        currency: sync.currency,
        syncedAt: new Date().toISOString(),
      });
    }

    return res.status(400).json({ error: 'Invalid wallet id' });
  } catch (err) {
    console.error('syncWallet error:', err);
    res.status(500).json({ error: err.message || 'Wallet sync failed' });
  }
};

exports.getWalletHistory = async (req, res) => {
  // TEMPORARY: for now, return user-level transfer history
  // because wallet-level ledger is not implemented yet.
  const userId = req.user.userId;
  try {
    const result = await db.query(
      `SELECT *,
        CASE WHEN fee = 0 THEN 'received' ELSE 'sent' END as direction
       FROM transactions
       WHERE sender_user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('getWalletHistory error:', err);
    res.status(500).json({ error: 'Could not fetch history' });
  }
};

// Atomic wallet-to-wallet transfer implementation with cross-provider support
exports.transferBetweenWallets = async (req, res) => {
  const userId = req.user.userId;
  const { fromWalletId, toWalletId, amount, note } = req.body || {};

  if (!fromWalletId || !toWalletId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const transferAmount = Number(amount);
  if (!Number.isFinite(transferAmount) || transferAmount < 5) {
    return res.status(400).json({ error: 'Minimum transfer amount is NLe 5' });
  }

  function calculateFee(a) {
    if (a <= 50) return 1;
    if (a <= 200) return 3;
    if (a <= 500) return 7;
    if (a <= 1000) return 12;
    return Math.round(a * 0.01);
  }

  const fee = calculateFee(transferAmount);
  const totalDeducted = transferAmount + fee;
  const reference = 'SMP-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();

  // Start database transaction for atomicity
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Resolve from wallet (who pays)
    let fromWallet = null;
    let fromLinkedWallet = null;
    let fromType = 'simplepay';
    let fromProvider = null;
    let fromAccountNumber = null;
    let fromIsSimplepay = false;

    if (String(fromWalletId).startsWith('simplepay-')) {
      fromIsSimplepay = true;
      fromProvider = 'simplepay';
      const walletRowId = String(fromWalletId).split('-')[1];
      const r = await client.query('SELECT id, balance, currency FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
      if (!r.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'From wallet not found' });
      }
      fromWallet = r.rows[0];
    } else if (String(fromWalletId).startsWith('linked-')) {
      fromType = 'linked';
      const linkedWalletId = String(fromWalletId).split('-')[1];
      
      // Try new linked_wallets table first, fallback to linked_accounts
      let la = await client.query(
        'SELECT * FROM linked_wallets WHERE id = $1 AND user_id = $2 AND is_active = true',
        [linkedWalletId, userId]
      );
      
      if (!la.rows.length) {
        // Compatibility: check linked_accounts
        la = await client.query(
          'SELECT * FROM linked_accounts WHERE id = $1 AND user_id = $2 AND is_active = true',
          [linkedWalletId, userId]
        );
        if (!la.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'From wallet not found' });
        }
      }
      
      fromLinkedWallet = la.rows[0];
      fromProvider = fromLinkedWallet.provider_id;
      fromAccountNumber = fromLinkedWallet.account_number;
      
      // For external wallet as source, we need to check if user has sufficient SimplePay balance
      // (Interim: all transfers go through SimplePay wallet)
      const w = await client.query('SELECT id, balance, currency FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      if (!w.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'SimplePay wallet not found' });
      }
      fromWallet = w.rows[0];
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid fromWalletId' });
    }

    if (fromWallet.balance < totalDeducted) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Resolve to wallet (who receives)
    let toWallet = null;
    let toLinkedWallet = null;
    let toProvider = null;
    let toAccountNumber = null;
    let toIsSimplepay = false;

    if (String(toWalletId).startsWith('simplepay-')) {
      toIsSimplepay = true;
      toProvider = 'simplepay';
      const walletRowId = String(toWalletId).split('-')[1];
      const w = await client.query('SELECT id, balance FROM wallets WHERE id = $1 AND user_id = $2', [walletRowId, userId]);
      if (!w.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'To wallet not found' });
      }
      toWallet = w.rows[0];
    } else if (String(toWalletId).startsWith('linked-')) {
      const linkedWalletId = String(toWalletId).split('-')[1];
      
      let la = await client.query(
        'SELECT id, provider_id, account_number FROM linked_wallets WHERE id = $1 AND user_id = $2 AND is_active = true',
        [linkedWalletId, userId]
      );
      
      if (!la.rows.length) {
        la = await client.query(
          'SELECT id, provider_id, account_number FROM linked_accounts WHERE id = $1 AND user_id = $2 AND is_active = true',
          [linkedWalletId, userId]
        );
        if (!la.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'To wallet not found' });
        }
      }
      
      toLinkedWallet = la.rows[0];
      toProvider = toLinkedWallet.provider_id;
      toAccountNumber = toLinkedWallet.account_number;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid toWalletId' });
    }

    // Get provider adapter for external transfers
    const fromAdapter = fromProvider && fromProvider !== 'simplepay' ? getAdapter(fromProvider) : null;
    const toAdapter = toProvider && toProvider !== 'simplepay' ? getAdapter(toProvider) : null;

    // Create wallet transaction record (pending)
    await client.query(
      `INSERT INTO wallet_transactions
        (wallet_id, user_id, type, amount, currency, balance_before, balance_after, 
         reference, from_provider, to_provider, from_wallet_id, to_wallet_id, 
         from_linked_wallet_id, to_linked_wallet_id, status, note)
       VALUES ($1, $2, 'transfer_out', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)`,
      [
        fromWallet.id, userId, totalDeducted, fromWallet.currency || 'SLE',
        fromWallet.balance, fromWallet.balance - totalDeducted,
        reference, fromProvider, toProvider, fromWallet.id, toWallet?.id || null,
        fromLinkedWallet?.id || null, toLinkedWallet?.id || null,
        note || null
      ]
    );

    // Deduct from SimplePay wallet (interim: all transfers use SimplePay as funding source)
    await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [totalDeducted, fromWallet.id]);

    // Create legacy transaction record
    await client.query(
      `INSERT INTO transactions
        (reference, sender_user_id, receiver_identifier, from_provider, to_provider, amount, fee, total_deducted, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')`,
      [reference, userId, toIsSimplepay ? 'internal' : (toAccountNumber || 'internal'), fromProvider, toProvider, transferAmount, fee, totalDeducted, note || null]
    );

    // Execute provider legs
    let providerResult = null;
    
    // If sending to external provider, call their adapter
    if (!toIsSimplepay && toAdapter) {
      providerResult = await toAdapter.initTransfer({
        to: toAccountNumber,
        amount: transferAmount,
      });
    } else if (fromIsSimplepay && toIsSimplepay) {
      // Internal SimplePay to SimplePay transfer
      providerResult = { providerReference: null, settledAt: new Date().toISOString(), creditedInternally: true };
    }

    // Credit recipient
    let creditedInternally = false;
    if (toIsSimplepay && toWallet) {
      // Credit to SimplePay wallet
      const balanceBefore = toWallet.balance;
      const balanceAfter = balanceBefore + transferAmount;
      
      await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [transferAmount, toWallet.id]);
      
      // Create credit transaction
      await client.query(
        `INSERT INTO wallet_transactions
          (wallet_id, user_id, type, amount, currency, balance_before, balance_after,
           reference, from_provider, to_provider, from_wallet_id, to_wallet_id,
           from_linked_wallet_id, to_linked_wallet_id, status, note)
         VALUES ($1, $2, 'transfer_in', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed', $14)`,
        [
          toWallet.id, userId, transferAmount, toWallet.currency || 'SLE',
          balanceBefore, balanceAfter, reference, fromProvider, toProvider,
          fromWallet.id, toWallet.id, fromLinkedWallet?.id || null, toLinkedWallet?.id || null,
          note || null
        ]
      );
      
      creditedInternally = true;
    } else if (toLinkedWallet) {
      // For external wallet destination, credit SimplePay wallet as placeholder (interim)
      // In production, this would be handled by provider webhook/callback
      const creditedWallet = await client.query('SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      if (creditedWallet.rows.length) {
        const cw = creditedWallet.rows[0];
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [transferAmount, cw.id]);
        creditedInternally = true;
      }
    }

    // Update transaction status to completed
    await client.query("UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE reference = $1", [reference]);

    // Update wallet_transactions status to completed
    await client.query(
      "UPDATE wallet_transactions SET status = 'completed', completed_at = NOW() WHERE reference = $1",
      [reference]
    );

    // Get new balance
    const newBalanceRow = await client.query('SELECT balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
    const newBalance = newBalanceRow.rows[0] ? newBalanceRow.rows[0].balance : null;

    await client.query('COMMIT');

    res.json({
      success: true,
      reference,
      amount: transferAmount,
      fee,
      total_deducted: totalDeducted,
      new_balance: newBalance,
      from_provider: fromProvider,
      to_provider: toProvider,
      provider_reference: providerResult?.providerReference || null,
      settled_at: providerResult?.settledAt || null,
      credited_internally: creditedInternally,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('transferBetweenWallets error:', err);
    res.status(500).json({ error: err.message || 'Transfer failed' });
  } finally {
    client.release();
  }
};

// keep old placeholder for now (unused)
exports.createTransferIntent = async () => {
  return { id: uuidv4() };
};

// Get wallet transaction history from new ledger
exports.getWalletTransactions = async (req, res) => {
  const userId = req.user.userId;
  const { walletId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    let query = `
      SELECT wt.*, w.balance as wallet_balance
      FROM wallet_transactions wt
      LEFT JOIN wallets w ON wt.wallet_id = w.id AND w.user_id = $1
      WHERE wt.user_id = $1
    `;
    const params = [userId];

    // Filter by specific wallet if provided
    if (walletId) {
      if (String(walletId).startsWith('simplepay-')) {
        const walletRowId = String(walletId).split('-')[1];
        query += ` AND wt.wallet_id = $${params.length + 1}`;
        params.push(walletRowId);
      } else if (String(walletId).startsWith('linked-')) {
        const linkedWalletId = String(walletId).split('-')[1];
        query += ` AND wt.to_linked_wallet_id = $${params.length + 1} OR wt.from_linked_wallet_id = $${params.length + 1}`;
        params.push(linkedWalletId);
      }
    }

    query += ` ORDER BY wt.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('getWalletTransactions error:', err);
    res.status(500).json({ error: 'Could not fetch wallet transactions' });
  }
};

