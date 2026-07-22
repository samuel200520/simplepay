/**
 * Financial Intelligence Engine
 * 
 * Aggregates and analyzes financial data across ALL connected wallets.
 * This implementation is resilient to missing tables/columns so the chat
 * does not crash the whole pipeline when a single source is unavailable.
 */

const db = require('../db');

async function safeQuery(query, params = [], fallback = { rows: [] }) {
  try {
    return await db.query(query, params);
  } catch (err) {
    console.error('Financial engine query failed:', err.message);
    return fallback;
  }
}

async function tableExists(tableName) {
  try {
    return await db.getTableExists(tableName);
  } catch (err) {
    return false;
  }
}

async function buildMultiWalletContext(userId) {
  // 1. Get user info
  const userResult = await safeQuery(
    'SELECT id, simplepay_account_number, full_name FROM users WHERE id = $1',
    [userId],
    { rows: [{}] }
  );
  const user = userResult.rows[0] || {};
  const simplepayNumber = user.simplepay_account_number;

  // 2. Get SimplePay wallets (internal wallet system)
  const hasWallets = await tableExists('wallets');
  const spWallets = hasWallets
    ? await safeQuery(`SELECT id, user_id, balance, wallet_name, currency, provider, created_at FROM wallets WHERE user_id = $1`, [userId])
    : { rows: [] };

  // 3. Get linked external wallets (banks, mobile money)
  const hasLinkedWallets = await tableExists('linked_wallets');
  const hasWalletBalances = await tableExists('wallet_balances');
  let linkedWallets = { rows: [] };
  if (hasLinkedWallets && hasWalletBalances) {
    linkedWallets = await safeQuery(
      `SELECT lw.id, lw.provider_id, lw.account_number, lw.account_name, lw.wallet_name,
              COALESCE(wb.balance, lw.balance, 0) as balance,
              COALESCE(wb.currency, lw.currency, 'SLE') as currency,
              lw.is_active, lw.last_sync, lw.created_at
       FROM linked_wallets lw
       LEFT JOIN wallet_balances wb ON wb.linked_wallet_id = lw.id
       WHERE lw.user_id = $1 AND lw.is_active = true`,
      [userId],
      { rows: [] }
    );
  } else if (hasLinkedWallets) {
    linkedWallets = await safeQuery(
      `SELECT id, provider_id, account_number, account_name, wallet_name,
              COALESCE(balance, 0) as balance,
              COALESCE(currency, 'SLE') as currency,
              is_active, last_sync, created_at
       FROM linked_wallets
       WHERE user_id = $1 AND is_active = true`,
      [userId],
      { rows: [] }
    );
  }

  // 4. Get wallet_transactions (all wallet movement ledger)
  const hasWalletTxns = await tableExists('wallet_transactions');
  const walletTxns = hasWalletTxns
    ? await safeQuery(`SELECT * FROM wallet_transactions WHERE user_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 100`, [userId])
    : { rows: [] };

  // 5. Get regular transactions (SimplePay transfers)
  const hasTransactionPurposes = await tableExists('transaction_purposes');
  let regularTxns = { rows: [] };
  if (hasTransactionPurposes) {
    regularTxns = await safeQuery(
      `SELECT t.*, tp.purpose
       FROM transactions t
       LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
       WHERE (t.sender_user_id = $1 OR t.receiver_identifier = $2)
         AND t.status = 'completed'
       ORDER BY t.created_at DESC LIMIT 100`,
      [userId, simplepayNumber],
      { rows: [] }
    );
  } else {
    regularTxns = await safeQuery(
      `SELECT * FROM transactions
       WHERE (sender_user_id = $1 OR receiver_identifier = $2)
         AND status = 'completed'
       ORDER BY created_at DESC LIMIT 100`,
      [userId, simplepayNumber],
      { rows: [] }
    );
  }

  // 6. Get savings data
  const hasSavingsTxns = await tableExists('savings_transactions');
  const savingsResult = hasSavingsTxns
    ? await safeQuery(
        `SELECT COALESCE(SUM(amount), 0) as total_saved, COUNT(*) as deposit_count
         FROM savings_transactions WHERE user_id = $1 AND type = 'deposit'`,
        [userId],
        { rows: [{ total_saved: 0, deposit_count: 0 }] }
      )
    : { rows: [{ total_saved: 0, deposit_count: 0 }] };

  // 7. Get savings goals
  const hasSavingsGoals = await tableExists('savings_goals');
  const goals = hasSavingsGoals
    ? await safeQuery(
        `SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
        [userId],
        { rows: [] }
      )
    : { rows: [] };

  return {
    userId,
    simplepayNumber,
    user,
    spWallets: spWallets.rows,
    linkedWallets: linkedWallets.rows,
    walletTxns: walletTxns.rows,
    regularTxns: regularTxns.rows,
    savings: savingsResult.rows[0] || { total_saved: 0, deposit_count: 0 },
    goals: goals.rows,
  };
}

function computeTotalBalance(ctx) {
  let total = 0;
  const breakdown = [];

  for (const w of ctx.spWallets) {
    const bal = Number(w.balance || 0);
    total += bal;
    breakdown.push({
      name: w.wallet_name || 'SimplePay Wallet',
      provider: w.provider || 'simplepay',
      type: 'wallet',
      balance: bal,
      currency: w.currency || 'SLE',
      accountNumber: ctx.simplepayNumber,
    });
  }

  for (const lw of ctx.linkedWallets) {
    const bal = Number(lw.balance || 0);
    total += bal;
    breakdown.push({
      name: lw.wallet_name || lw.account_name || `${lw.provider_id} Account`,
      provider: lw.provider_id,
      type: getWalletType(lw.provider_id),
      balance: bal,
      currency: lw.currency || 'SLE',
      accountNumber: lw.account_number,
      linkedWalletId: lw.id,
    });
  }

  return { total, breakdown };
}

function getWalletType(providerId) {
  const p = String(providerId || '').toLowerCase();
  if (p === 'simplepay') return 'wallet';
  if (['orange', 'africell', 'qmoney'].includes(p)) return 'mobile_money';
  return 'bank';
}

function computeWalletActivity(ctx) {
  const walletActivity = {};

  for (const w of ctx.spWallets) {
    walletActivity[w.id] = {
      walletId: w.id,
      name: w.wallet_name || 'SimplePay Wallet',
      provider: w.provider || 'simplepay',
      type: 'wallet',
      sentCount: 0,
      receivedCount: 0,
      sentVolume: 0,
      receivedVolume: 0,
      totalTransactions: 0,
    };
  }
  for (const lw of ctx.linkedWallets) {
    walletActivity[`linked-${lw.id}`] = {
      walletId: lw.id,
      name: lw.wallet_name || lw.account_name || lw.provider_id,
      provider: lw.provider_id,
      type: getWalletType(lw.provider_id),
      sentCount: 0,
      receivedCount: 0,
      sentVolume: 0,
      receivedVolume: 0,
      totalTransactions: 0,
    };
  }

  for (const txn of ctx.walletTxns) {
    if (txn.type === 'transfer_out' || txn.type === 'debit') {
      const key = txn.from_linked_wallet_id ? `linked-${txn.from_linked_wallet_id}` : txn.wallet_id;
      if (walletActivity[key]) {
        walletActivity[key].sentCount++;
        walletActivity[key].sentVolume += Number(txn.amount || 0);
        walletActivity[key].totalTransactions++;
      }
    }
    if (txn.type === 'transfer_in' || txn.type === 'credit') {
      const key = txn.to_linked_wallet_id ? `linked-${txn.to_linked_wallet_id}` : txn.wallet_id;
      if (walletActivity[key]) {
        walletActivity[key].receivedCount++;
        walletActivity[key].receivedVolume += Number(txn.amount || 0);
        walletActivity[key].totalTransactions++;
      }
    }
  }

  for (const txn of ctx.regularTxns) {
    const isSender = txn.sender_user_id === ctx.userId;
    const isReceiver = txn.receiver_identifier === ctx.simplepayNumber && txn.sender_user_id !== ctx.userId;
    const spKey = Object.keys(walletActivity).find(k => !k.startsWith('linked-'));
    if (spKey) {
      if (isSender && (txn.fee > 0 || txn.to_provider !== 'simplepay')) {
        walletActivity[spKey].sentCount++;
        walletActivity[spKey].sentVolume += Number(txn.amount || 0);
        walletActivity[spKey].totalTransactions++;
      }
      if (isReceiver) {
        walletActivity[spKey].receivedCount++;
        walletActivity[spKey].receivedVolume += Number(txn.amount || 0);
        walletActivity[spKey].totalTransactions++;
      }
    }
  }

  const activityList = Object.values(walletActivity);
  activityList.sort((a, b) => b.totalTransactions - a.totalTransactions);

  return {
    wallets: activityList,
    mostActive: activityList[0] || null,
    totalWallets: activityList.length,
  };
}

function computeMoneyReceived(ctx) {
  let totalReceived = 0;
  let transactionCount = 0;
  const sources = {};

  for (const txn of ctx.walletTxns) {
    if (txn.type === 'transfer_in' || txn.type === 'credit') {
      const amount = Number(txn.amount || 0);
      totalReceived += amount;
      transactionCount++;
      const source = txn.from_provider || 'external';
      if (!sources[source]) sources[source] = { total: 0, count: 0 };
      sources[source].total += amount;
      sources[source].count++;
    }
  }

  for (const txn of ctx.regularTxns) {
    if (txn.receiver_identifier === ctx.simplepayNumber && txn.sender_user_id !== ctx.userId) {
      const amount = Number(txn.amount || 0);
      totalReceived += amount;
      transactionCount++;
      const source = txn.from_provider || 'simplepay';
      if (!sources[source]) sources[source] = { total: 0, count: 0 };
      sources[source].total += amount;
      sources[source].count++;
    }
  }

  const averageReceived = transactionCount > 0 ? totalReceived / transactionCount : 0;
  const sourceList = Object.entries(sources)
    .map(([name, data]) => ({ source: name, total: data.total, count: data.count }))
    .sort((a, b) => b.total - a.total);

  return {
    totalReceived,
    transactionCount,
    averageReceived: Math.round(averageReceived * 100) / 100,
    sources: sourceList,
  };
}

function computeMoneySent(ctx) {
  let totalSent = 0;
  let transactionCount = 0;
  const destinations = {};
  const categories = {};

  for (const txn of ctx.walletTxns) {
    if (txn.type === 'transfer_out' || txn.type === 'debit') {
      const amount = Number(txn.amount || 0);
      totalSent += amount;
      transactionCount++;
      const dest = txn.to_provider || 'external';
      if (!destinations[dest]) destinations[dest] = { total: 0, count: 0 };
      destinations[dest].total += amount;
      destinations[dest].count++;
    }
  }

  for (const txn of ctx.regularTxns) {
    if (txn.sender_user_id === ctx.userId && (txn.fee > 0 || txn.to_provider !== 'simplepay')) {
      const amount = Number(txn.amount || 0);
      totalSent += amount;
      transactionCount++;
      const dest = txn.to_provider || 'unknown';
      if (!destinations[dest]) destinations[dest] = { total: 0, count: 0 };
      destinations[dest].total += amount;
      destinations[dest].count++;

      const cat = txn.purpose || 'Other';
      if (!categories[cat]) categories[cat] = { total: 0, count: 0 };
      categories[cat].total += amount;
      categories[cat].count++;
    }
  }

  const averageSent = transactionCount > 0 ? totalSent / transactionCount : 0;
  const destList = Object.entries(destinations)
    .map(([name, data]) => ({ destination: name, total: data.total, count: data.count }))
    .sort((a, b) => b.total - a.total);

  const categoryList = Object.entries(categories)
    .map(([name, data]) => ({ category: name, total: data.total, count: data.count }))
    .sort((a, b) => b.total - a.total);

  return {
    totalSent,
    transactionCount,
    averageSent: Math.round(averageSent * 100) / 100,
    destinations: destList,
    categories: categoryList,
  };
}

function computeSavingsAnalysis(ctx) {
  const totalSaved = Number(ctx.savings?.total_saved || 0);
  const depositCount = Number(ctx.savings?.deposit_count || 0);
  const goals = ctx.goals || [];

  const goalsAnalysis = goals.map(g => {
    const target = Number(g.target_amount || 0);
    const current = Number(g.current_amount || 0);
    const progress = target > 0 ? Math.round((current / target) * 100) : 0;
    const remaining = target - current;
    return {
      id: g.id,
      name: g.name,
      targetAmount: target,
      currentAmount: current,
      progress,
      remaining,
      isActive: g.is_active,
      autoSaveEnabled: g.auto_save_enabled,
      createdAt: g.created_at,
    };
  });

  const totalTargets = goalsAnalysis.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalCurrent = goalsAnalysis.reduce((sum, g) => sum + g.currentAmount, 0);
  const overallProgress = totalTargets > 0 ? Math.round((totalCurrent / totalTargets) * 100) : 0;

  const completedGoals = goalsAnalysis.filter(g => g.progress >= 100).length;
  const activeGoals = goalsAnalysis.filter(g => g.is_active).length;

  return {
    totalSaved,
    depositCount,
    goalsCount: goals.length,
    activeGoals,
    completedGoals,
    overallProgress,
    totalTargets,
    totalCurrent,
    goals: goalsAnalysis,
  };
}

function computeHealthScore(ctx, balanceData, moneyReceived, moneySent, savingsAnalysis) {
  let score = 50;

  const totalBalance = balanceData.total;
  const totalSent = moneySent.totalSent;
  const totalReceived = moneyReceived.totalReceived;
  const totalSaved = savingsAnalysis.totalSaved;

  if (totalBalance > 0) score += 5;
  if (totalBalance > 1000) score += 5;
  if (totalBalance > 5000) score += 5;

  if (totalReceived > 0) score += 5;
  if (totalReceived > totalSent && totalSent > 0) score += 10;
  if (totalReceived > totalSent * 1.5) score += 5;

  if (totalSaved > 0) score += 10;
  if (totalSaved > totalSent * 0.1 && totalSent > 0) score += 5;
  if (totalSaved > totalSent * 0.2 && totalSent > 0) score += 5;

  if (savingsAnalysis.goalsCount > 0) score += 5;
  if (savingsAnalysis.completedGoals > 0) score += 5;
  if (savingsAnalysis.overallProgress >= 50) score += 5;

  if (balanceData.breakdown.length >= 2) score += 3;
  if (balanceData.breakdown.length >= 3) score += 2;

  const totalTxns = moneyReceived.transactionCount + moneySent.transactionCount;
  if (totalTxns > 5) score += 3;
  if (totalTxns > 20) score += 2;

  return Math.min(100, Math.max(0, score));
}

function generateSmartInsights(ctx, balanceData, walletActivity, moneyReceived, moneySent, savingsAnalysis, healthScore) {
  const insights = [];

  if (balanceData.breakdown.length > 1) {
    const richest = balanceData.breakdown.sort((a, b) => b.balance - a.balance)[0];
    insights.push({
      type: 'info',
      title: 'Wallet Overview',
      message: `You have ${balanceData.breakdown.length} connected wallets with a total of NLe ${balanceData.total.toLocaleString()}. Your ${richest.name} holds the most at NLe ${richest.balance.toLocaleString()}.`,
    });
  }

  if (walletActivity.mostActive && walletActivity.mostActive.totalTransactions > 0) {
    insights.push({
      type: 'info',
      title: 'Most Active Wallet',
      message: `Your most active wallet is ${walletActivity.mostActive.name} with ${walletActivity.mostActive.totalTransactions} transactions this period.`,
    });
  }

  if (moneySent.categories.length > 0) {
    const topCat = moneySent.categories[0];
    const sentTotal = moneySent.totalSent;
    const pct = sentTotal > 0 ? Math.round((topCat.total / sentTotal) * 100) : 0;
    let advice = '';
    if (pct > 40) advice = ' This is quite high. Consider reducing this category.';
    else if (pct > 25) advice = ' Small reductions could add up to significant savings.';
    insights.push({
      type: pct > 30 ? 'warning' : 'info',
      title: 'Top Spending Category',
      message: `${topCat.category} is your biggest expense at NLe ${topCat.total.toLocaleString()} (${pct}% of spending).${advice}`,
    });
  }

  if (moneyReceived.totalReceived > 0 && moneySent.totalSent > 0) {
    const received = moneyReceived.totalReceived;
    const sent = moneySent.totalSent;
    if (sent > received) {
      insights.push({
        type: 'warning',
        title: 'Spending Alert',
        message: `You sent NLe ${sent.toLocaleString()} but only received NLe ${received.toLocaleString()}. Consider reviewing your spending to build savings.`,
      });
    } else if (received > sent) {
      const surplus = received - sent;
      insights.push({
        type: 'success',
        title: 'Positive Cash Flow',
        message: `You received NLe ${received.toLocaleString()} and spent NLe ${sent.toLocaleString()}, leaving a surplus of NLe ${surplus.toLocaleString()}. Consider saving a portion!`,
      });
    }
  }

  if (savingsAnalysis.goalsCount > 0) {
    const nearComplete = savingsAnalysis.goals.find(g => g.progress >= 75 && g.progress < 100);
    if (nearComplete) {
      insights.push({
        type: 'goal',
        title: 'Almost There!',
        message: `Your "${nearComplete.name}" goal is ${nearComplete.progress}% complete. Only NLe ${nearComplete.remaining.toLocaleString()} to go!`,
      });
    }
  } else if (savingsAnalysis.totalSaved === 0) {
    insights.push({
      type: 'tip',
      title: 'Start Saving',
      message: 'You haven\'t started saving yet. Creating a savings goal is the first step toward financial security.',
    });
  }

  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Improvement';
  insights.push({
    type: healthScore >= 60 ? 'success' : 'warning',
    title: `Financial Health: ${scoreLabel}`,
    message: `Your score is ${healthScore}/100. ${getHealthAdvice(healthScore)}`,
  });

  const sentCount = moneySent.transactionCount;
  const receivedCount = moneyReceived.transactionCount;
  if (sentCount >= 5) {
    insights.push({
      type: 'info',
      title: 'Transaction Activity',
      message: `You've made ${sentCount} outgoing and ${receivedCount} incoming transactions. Your average sent amount is NLe ${moneySent.averageSent.toLocaleString()}.`,
    });
  }

  return insights;
}

function getHealthAdvice(score) {
  if (score >= 80) return 'You\'re managing your finances well across all wallets. Keep maintaining these healthy habits.';
  if (score >= 60) return 'Good progress! Focus on building your savings and reducing unnecessary spending.';
  if (score >= 40) return 'There\'s room for improvement. Start tracking expenses and creating savings goals.';
  return 'Focus on reducing spending, building savings, and creating financial goals. I can help you make a plan.';
}

async function getFinancialOverview(userId) {
  const ctx = await buildMultiWalletContext(userId);
  const balanceData = computeTotalBalance(ctx);
  const walletActivity = computeWalletActivity(ctx);
  const moneyReceived = computeMoneyReceived(ctx);
  const moneySent = computeMoneySent(ctx);
  const savingsAnalysis = computeSavingsAnalysis(ctx);
  const healthScore = computeHealthScore(ctx, balanceData, moneyReceived, moneySent, savingsAnalysis);
  const insights = generateSmartInsights(ctx, balanceData, walletActivity, moneyReceived, moneySent, savingsAnalysis, healthScore);

  return {
    totalBalance: balanceData.total,
    walletBreakdown: balanceData.breakdown,
    walletActivity,
    moneyReceived,
    moneySent,
    savings: savingsAnalysis,
    healthScore,
    insights,
    totalWallets: balanceData.breakdown.length,
  };
}

function safeMap(arr, fallback = []) {
  if (!Array.isArray(arr)) return fallback;
  return arr;
}

async function buildChatContext(userId) {
  const overview = await getFinancialOverview(userId);
  
  return {
    total_balance: overview.totalBalance,
    wallet_count: overview.totalWallets,
    wallets: safeMap(overview.walletBreakdown).map(w => ({
      name: w.name,
      provider: w.provider,
      type: w.type,
      balance: w.balance,
      currency: w.currency,
    })),

    most_active_wallet: overview.walletActivity?.mostActive
      ? {
          name: overview.walletActivity.mostActive.name,
          transactions: overview.walletActivity.mostActive.totalTransactions,
          sentVolume: overview.walletActivity.mostActive.sentVolume,
          receivedVolume: overview.walletActivity.mostActive.receivedVolume,
        }
      : null,
    all_wallet_activity: safeMap(overview.walletActivity?.wallets).map(w => ({
      name: w.name,
      provider: w.provider,
      sentCount: w.sentCount,
      receivedCount: w.receivedCount,
      sentVolume: w.sentVolume,
      receivedVolume: w.receivedVolume,
    })),

    total_received: overview.moneyReceived.totalReceived,
    received_transaction_count: overview.moneyReceived.transactionCount,
    average_received: overview.moneyReceived.averageReceived,
    received_sources: safeMap(overview.moneyReceived.sources),

    total_sent: overview.moneySent.totalSent,
    sent_transaction_count: overview.moneySent.transactionCount,
    average_sent: overview.moneySent.averageSent,
    spending_categories: safeMap(overview.moneySent.categories),
    spending_destinations: safeMap(overview.moneySent.destinations),

    total_saved: overview.savings.totalSaved,
    savings_deposit_count: overview.savings.depositCount,
    goals_count: overview.savings.goalsCount,
    active_goals: overview.savings.activeGoals,
    completed_goals: overview.savings.completedGoals,
    savings_progress: overview.savings.overallProgress,
    goals: safeMap(overview.savings.goals).map(g => ({
      name: g.name,
      target: g.targetAmount,
      current: g.currentAmount,
      progress: g.progress,
      remaining: g.remaining,
    })),

    health_score: overview.healthScore,
    health_label: overview.healthScore >= 80 ? 'Excellent' : overview.healthScore >= 60 ? 'Good' : overview.healthScore >= 40 ? 'Fair' : 'Needs Improvement',

    smart_insights: safeMap(overview.insights),
  };
}

module.exports = {
  buildMultiWalletContext,
  buildChatContext,
  getFinancialOverview,
  computeTotalBalance,
  computeWalletActivity,
  computeMoneyReceived,
  computeMoneySent,
  computeSavingsAnalysis,
  computeHealthScore,
  generateSmartInsights,
};
