module.exports = (providerId) => {
  return {
    async getBalance({ accountNumber }) {
      // Simulated provider balance sync.
      // Replace with real provider API calls later.
      await new Promise((r) => setTimeout(r, 120));
      const seed = String(accountNumber || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const balance = (seed % 100000) / 10; // deterministic-ish
      return { balance: Math.round(balance), currency: 'SLE' };
    },

    async initTransfer({ to, amount }) {
      await new Promise((r) => setTimeout(r, 100));
      return {
        providerReference: `${providerId.toUpperCase()}-${Date.now()}`,
        settledAt: new Date().toISOString(),
        creditedInternally: false,
        amount,
        to,
      };
    },
  };
};

