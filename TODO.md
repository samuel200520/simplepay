# TODO - SimplePay multi-wallet redesign

## Step 1: Baseline + requirements mapping
- [x] Inspect current backend routes/controllers and identify existing data flows (auth, linked_accounts, transactions, transfer, admin).
- [x] Inspect current frontend/mobile transfer flow assumptions (single SimplePay wallet, PIN only in web).

## Step 2: Design backend data model
- [x] Define DB schema changes for multi-wallet (linked_wallets, wallet_balances, sync logs, wallet_transactions ledger).
- [x] Decide how to represent provider legs vs internal transfers in the ledger.

## Step 3: Implement adapter-based provider integration
- [x] Create provider adapter registry + adapter interface.
- [x] Implement initial "simulated" adapters for Orange/Afrimoney/QMoney/Bank/SimplePay.

## Step 4: Add backend API endpoints
- [x] Implement GET /api/wallets (wallet cards w/ cached balances + status).
- [x] Implement POST /api/wallets/:walletId/sync (manual refresh).
- [x] Implement POST /api/wallets/transfers (transfer between wallets).
- [x] Implement GET /api/wallets/:walletId/transactions (history).

## Step 5: Wire into transfer logic
- [x] Replace old /api/transfer/send & /api/transfer/history usage (keep temporary compatibility if needed).
- [x] Ensure wallet-to-wallet transfers are atomic (reserve + commit) using DB transactions.

## Step 6: Keep existing product working during migration
- [x] Add compatibility layer mapping old linked_accounts to linked_wallets.

## Step 7: Testing + validation
- [x] Add basic integration tests or runbook commands.
- [x] Manual sanity checks: link wallet → wallet appears → sync updates → transfer updates both balances.