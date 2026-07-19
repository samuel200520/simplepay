// Provider adapter registry.
// Adapters encapsulate provider-specific API integration.

const adapters = {
  // SimplePay internal wallet (uses cached DB balance for now)
  simplepay: require('./simplepayAdapter'),

  orange: require('./mobileMoneyAdapter')('orange'),
  africell: require('./mobileMoneyAdapter')('africell'),
  qmoney: require('./mobileMoneyAdapter')('qmoney'),

  // Bank adapters (simulated for now)
  rokel: require('./bankAdapter')('rokel'),
  slcb: require('./bankAdapter')('slcb'),
  gtbank: require('./bankAdapter')('gtbank'),
  ecobank: require('./bankAdapter')('ecobank'),
  union: require('./bankAdapter')('union'),
  access: require('./bankAdapter')('access'),
  uba: require('./bankAdapter')('uba'),
  bsl: require('./bankAdapter')('bsl'),
};

function getAdapter(providerId) {
  const key = String(providerId || '').toLowerCase();
  const adapter = adapters[key];
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${providerId}`);
  }
  return adapter;
}

module.exports = { getAdapter };

