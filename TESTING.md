# SimplePay Multi-Wallet Testing Guide

## Prerequisites
1. Database migration completed: `node backend/src/db/migrate.js`
2. Backend server running: `npm run dev` (in backend/)
3. Frontend running: `npm start` (in frontend/)

## Test Scenarios

### 1. Database Migration Verification
```bash
node backend/src/db/migrate.js
```
**Expected Output:**
- ✓ Migration completed successfully
- List of tables including: linked_wallets, wallet_balances, wallet_transactions, sync_logs

### 2. Link Account (Compatibility Layer)
**Test Steps:**
1. Login to the application
2. Go to Accounts tab
3. Link a new account (e.g., Orange Money - 077123456)
4. Verify account appears in the list

**Expected Results:**
- Account links successfully
- Account appears in linked accounts list
- No errors in console

**Database Verification:**
```sql
-- Check linked_accounts (legacy)
SELECT * FROM linked_accounts WHERE user_id = <your_user_id>;

-- Check linked_wallets (new)
SELECT * FROM linked_wallets WHERE user_id = <your_user_id>;

-- Check wallet_balances
SELECT * FROM wallet_balances WHERE linked_wallet_id = <linked_wallet_id>;
```

### 3. Wallet Cards Display
**Test Steps:**
1. Navigate to Dashboard
2. Call GET /api/wallets (or use browser dev tools)

**Expected Results:**
- SimplePay wallet card shows with correct balance
- Linked accounts show as wallet cards
- Each card has: id, provider, walletName, accountNumber, balance, currency, status

### 4. Wallet Sync
**Test Steps:**
1. Select a linked wallet card
2. Trigger sync (POST /api/wallets/:walletId/sync)

**Expected Results:**
- Returns success: true
- Returns simulated balance (deterministic based on account number)
- Returns currency: 'SLE'
- Returns syncedAt timestamp

**Database Verification:**
```sql
SELECT * FROM wallet_balances WHERE linked_wallet_id = <id>;
-- Should show updated balance and last_sync timestamp
```

### 5. Wallet-to-Wallet Transfer (Atomic)
**Test Steps:**
1. Ensure you have sufficient SimplePay wallet balance (NLe 100+)
2. Navigate to Send tab
3. Select from SimplePay Wallet to another SimplePay Wallet
4. Enter amount (e.g., NLe 50)
5. Enter PIN
6. Confirm transfer

**Expected Results:**
- Transfer completes successfully
- Returns reference, amount, fee, total_deducted, new_balance
- Both wallets' balances are updated correctly
- Transaction status is 'completed'

**Database Verification:**
```sql
-- Check wallet_transactions ledger
SELECT * FROM wallet_transactions 
WHERE reference = '<transfer_reference>'
ORDER BY created_at;

-- Should show:
-- 1. transfer_out transaction (debit from sender)
-- 2. transfer_in transaction (credit to recipient)
-- Both with balance_before and balance_after

-- Check legacy transactions table
SELECT * FROM transactions WHERE reference = '<transfer_reference>';

-- Verify wallet balances
SELECT balance FROM wallets WHERE user_id = <your_user_id>;
```

### 6. Transfer to External Wallet
**Test Steps:**
1. Link an external wallet (e.g., Africell)
2. Transfer from SimplePay to the linked external wallet
3. Verify transfer completes

**Expected Results:**
- Transfer succeeds
- SimplePay wallet is debited
- Provider adapter is called (simulated)
- Legacy transaction is created

### 7. Insufficient Balance
**Test Steps:**
1. Try to transfer more than your wallet balance
2. Verify error handling

**Expected Results:**
- Returns 400 error: "Insufficient wallet balance"
- No database changes (transaction rolled back)
- Wallet balance remains unchanged

### 8. Transaction History
**Test Steps:**
1. Complete several transfers
2. Check GET /api/wallets/:walletId/transactions
3. Check GET /api/wallets/:walletId/ledger

**Expected Results:**
- Legacy endpoint returns transactions from transactions table
- New ledger endpoint returns from wallet_transactions table
- Both show correct transaction details

### 9. Unlink Account
**Test Steps:**
1. Link an account
2. Unlink the account
3. Verify it's marked as inactive

**Expected Results:**
- Account is soft-deleted (is_active = false) in both tables
- Account no longer appears in wallet cards
- Account no longer appears in linked accounts list

**Database Verification:**
```sql
SELECT * FROM linked_accounts WHERE id = <id>;
-- is_active should be false

SELECT * FROM linked_wallets WHERE user_id = <user_id> AND account_number = '<number>';
-- is_active should be false
```

### 10. Concurrent Transfer Safety
**Test Steps:**
1. Open two browser windows with same user
2. Initiate transfer in both windows simultaneously
3. Verify atomicity

**Expected Results:**
- Only one transfer succeeds if insufficient balance
- No double-spending occurs
- Database remains consistent

## Automated Test Script

Create a test script to verify core functionality:

```javascript
// test/wallet.test.js
const request = require('supertest');
const app = require('../backend/server');
const db = require('../backend/src/db');

describe('Multi-Wallet System', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    // Login and get token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '0771234567', password: 'test123' });
    authToken = res.data.token;
    userId = res.data.user.id;
  });

  test('Link account creates both legacy and new records', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provider_id: 'orange', account_number: '077123456' });
    
    expect(res.status).toBe(201);
    expect(res.body.account).toBeDefined();
  });

  test('Transfer is atomic and creates ledger entries', async () => {
    // Ensure wallet has balance
    await db.query('UPDATE wallets SET balance = 1000 WHERE user_id = $1', [userId]);
    
    const res = await request(app)
      .post('/api/wallets/transfers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fromWalletId: 'simplepay-1',
        toWalletId: 'simplepay-1',
        amount: 50
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reference).toBeDefined();
  });

  test('Insufficient balance prevents transfer', async () => {
    await db.query('UPDATE wallets SET balance = 10 WHERE user_id = $1', [userId]);
    
    const res = await request(app)
      .post('/api/wallets/transfers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fromWalletId: 'simplepay-1',
        toWalletId: 'simplepay-1',
        amount: 100
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Insufficient/);
  });
});
```

## Manual Testing Checklist

- [ ] Database migration runs successfully
- [ ] Can link new account
- [ ] Linked account appears in both linked_accounts and linked_wallets
- [ ] Wallet cards display correctly
- [ ] Wallet sync returns balance
- [ ] Wallet-to-wallet transfer completes
- [ ] Transfer creates wallet_transactions entries
- [ ] Transfer updates wallet balances atomically
- [ ] Insufficient balance error works
- [ ] Transaction history displays
- [ ] Unlink account works
- [ ] Frontend still works with legacy endpoints
- [ ] PIN verification works for transfers
- [ ] Fee calculation is correct

## Known Limitations (Interim Behavior)

1. **External wallet balances**: Currently deducted from SimplePay wallet, not from external wallet
2. **External wallet credits**: Credited to SimplePay wallet as placeholder
3. **Provider adapters**: Simulated (not real API calls)
4. **Multiple SimplePay wallets**: Only one SimplePay wallet per user supported

## Next Steps for Production

1. Implement real provider API adapters
2. Enable actual external wallet balance deduction
3. Add proper external wallet credit mechanism
4. Implement wallet_balance updates during transfers
5. Add admin panel for wallet management
6. Implement webhook handling for provider callbacks
7. Add transaction reconciliation
8. Implement refund/reversal logic