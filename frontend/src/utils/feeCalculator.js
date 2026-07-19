const PROVIDER_TYPES = {
  simplepay: 'simplepay',
  orange: 'mobile_money',
  africell: 'mobile_money',
  qmoney: 'mobile_money',
  rokel: 'bank',
  slcb: 'bank',
  gtbank: 'bank',
  ecobank: 'bank',
  union_trust: 'bank',
  access: 'bank',
  bsl: 'bank',
  uba: 'bank',
};

function getProviderType(providerId) {
  return PROVIDER_TYPES[providerId] || 'bank';
}

function getTransferType(fromProvider, toProvider) {
  if (fromProvider === 'simplepay' && toProvider === 'simplepay') {
    return 'simplepay_to_simplepay';
  }

  const fromType = getProviderType(fromProvider);
  const toType = getProviderType(toProvider);

  if (fromType === 'mobile_money' && toType === 'mobile_money') {
    return 'mm_to_mm';
  }
  if ((fromType === 'bank' && toType === 'mobile_money') || (fromType === 'mobile_money' && toType === 'bank')) {
    return 'bank_to_mm';
  }
  if (fromType === 'bank' && toType === 'bank') {
    return 'bank_to_bank';
  }

  return 'bank_to_bank';
}

function calculateTransactionFee(amount, fromProvider, toProvider) {
  const transferAmount = Number(amount);
  if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
    return { fee: 0, transferType: 'simplepay_to_simplepay', total: transferAmount };
  }

  const transferType = getTransferType(fromProvider, toProvider);

  if (transferType === 'simplepay_to_simplepay') {
    return { fee: 0, transferType, total: transferAmount };
  }

  let fee = 0;

  if (transferAmount <= 100) {
    if (transferType === 'mm_to_mm') fee = 4;
    else if (transferType === 'bank_to_mm') fee = 5;
    else if (transferType === 'bank_to_bank') fee = 6;
  } else if (transferAmount <= 500) {
    if (transferType === 'mm_to_mm') fee = 6;
    else if (transferType === 'bank_to_mm') fee = 8;
    else if (transferType === 'bank_to_bank') fee = 10;
  } else if (transferAmount <= 1000) {
    if (transferType === 'mm_to_mm') fee = 8;
    else if (transferType === 'bank_to_mm') fee = 10;
    else if (transferType === 'bank_to_bank') fee = 12;
  } else if (transferAmount <= 5000) {
    if (transferType === 'mm_to_mm') fee = 12;
    else if (transferType === 'bank_to_mm') fee = 17;
    else if (transferType === 'bank_to_bank') fee = 20;
  } else if (transferAmount <= 10000) {
    if (transferType === 'mm_to_mm') fee = 17;
    else if (transferType === 'bank_to_mm') fee = 22;
    else if (transferType === 'bank_to_bank') fee = 27;
  } else {
    if (transferType === 'mm_to_mm') fee = Math.round(transferAmount * 0.0025);
    else if (transferType === 'bank_to_mm') fee = Math.round(transferAmount * 0.0035);
    else if (transferType === 'bank_to_bank') fee = Math.round(transferAmount * 0.0045);
  }

  return {
    fee,
    transferType,
    total: transferAmount + fee,
  };
}

module.exports = {
  calculateTransactionFee,
  getTransferType,
  getProviderType,
  PROVIDER_TYPES,
};
