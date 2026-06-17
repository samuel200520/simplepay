const providers = [
  { id: 'orange',   name: 'Orange Money',    type: 'mobile_money',  color: '#ff6600', short: 'OM' },
  { id: 'africell', name: 'Africell Money',  type: 'mobile_money',  color: '#e4003a', short: 'AM' },
  { id: 'qmoney',   name: 'QMoney',          type: 'mobile_money',  color: '#8a2be2', short: 'QM' },
  { id: 'rokel',    name: 'Rokel Bank',       type: 'bank',          color: '#1a6b3c', short: 'RCB' },
  { id: 'slcb',     name: 'SLCB',            type: 'bank',          color: '#003580', short: 'SLC' },
  { id: 'gtbank',   name: 'GT Bank',          type: 'bank',          color: '#f37021', short: 'GTB' },
  { id: 'ecobank',  name: 'Ecobank',          type: 'bank',          color: '#003087', short: 'ECO' },
  { id: 'union',    name: 'Union Trust Bank', type: 'bank',          color: '#5c1a8a', short: 'UTB' },
  { id: 'access',   name: 'Access Bank',      type: 'bank',          color: '#c8102e', short: 'ACC' },
  { id: 'bsl',      name: 'Bank of SL',       type: 'central_bank', color: '#1a4080', short: 'BSL' },
  { id: 'uba',      name: 'UBA',              type: 'bank',          color: '#e4003a', short: 'UBA' },
];

async function sendToProvider(providerId, accountNumber, amount) {
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
  if (Math.random() < 0.02) {
    throw new Error(`Provider ${providerId} temporarily unavailable`);
  }
  return {
    success: true,
    providerReference: `${providerId.toUpperCase()}-${Date.now()}`,
    settledAt: new Date().toISOString(),
  };
}

module.exports = { providers, sendToProvider };