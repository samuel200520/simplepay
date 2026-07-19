// Adapter for SimplePay internal wallet.
// At this stage, it relies on DB-side balances (handled by controllers/services).

module.exports = {
  async getBalance() {
    // Controller should supply current balance when using internal wallet.
    return { balance: null, currency: 'SLE' };
  },

  async initTransfer() {
    throw new Error('SimplePay adapter does not execute external transfers directly');
  },
};

