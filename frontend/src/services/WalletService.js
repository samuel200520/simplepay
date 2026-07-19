/**
 * WalletService — abstraction layer between UI and wallet API.
 *
 * Future: when real provider APIs are integrated, update the methods
 * below to fetch real balances. The UI components stay unchanged.
 */
import client from '../api/client';

export async function fetchWallets() {
  const res = await client.get('/wallets');
  return res.data.wallets;
}

export async function fetchProviders() {
  const res = await client.get('/user/providers');
  return res.data.providers;
}

export async function syncWallet(walletId) {
  const res = await client.post(`/wallets/${walletId}/sync`);
  return res.data;
}

export async function linkAccount(providerId, accountNumber) {
  const res = await client.post('/accounts', { provider_id: providerId, account_number: accountNumber });
  return res.data;
}

export async function unlinkAccount(accountId) {
  const res = await client.delete(`/accounts/${accountId}`);
  return res.data;
}

export async function transferBetweenWallets(payload) {
  const res = await client.post('/wallets/transfers', payload);
  return res.data;
}

export async function fetchTransactions() {
  const res = await client.get('/transfer/history');
  return res.data.transactions;
}

export async function fetchProfile() {
  const res = await client.get('/user/profile');
  return res.data;
}

export async function setPin(pin) {
  const res = await client.post('/user/set-pin', { pin });
  return res.data;
}

export async function verifyPin(pin) {
  const res = await client.post('/user/verify-pin', { pin });
  return res.data;
}
