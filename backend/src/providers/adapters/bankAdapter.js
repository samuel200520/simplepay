module.exports = (providerId) => {
  return {
    async getBalance({ accountNumber }) {
      // Simulated bank balance sync.
      await new Promise((r) => setTimeout(r, 180));
      const seed = String(accountNumber || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const balance = (seed % 200000) / 10;
      return { balance: Math.round(balance), currency: 'SLE' };
    },

    async initTransfer({ to, amount }) {
      await new Promise((r) => setTimeout(r, 140));
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

