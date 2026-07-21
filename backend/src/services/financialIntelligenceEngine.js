/**
 * Financial Intelligence Engine
 * 
 * Aggregates and analyzes financial data across ALL connected wallets:
 * - SimplePay Wallet
 * - Bank Accounts (via linked_wallets)
 * - Mobile Money Wallets (Orange Money, Africell Money, QMoney)
 * 
 * Provides:
 * - Total financial overview
 * - Wallet comparison & activity analysis
 * - Money received (inflow) analysis
 * - Money sent (outflow/spending) analysis
 * - Savings analysis
 * - Financial health scoring
 * - Smart insights generation
 */

const db = require('../db');

/**
 * Build a complete multi-wallet financial context for a user.
 * Queries ALL connected sources: SimplePay wallets, linked_wallets (banks, mobile money).
 */
async function buildMultiWalletContext(userId) {
  // 1. Get user info
  const userResult = await db.query(
    'SELECT id, simplepay_account_number, full_name FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || {};
  const simplepayNumber = user.simplepay_account_number;

  // 2. Get SimplePay wallets (internal wallet system)
  const spWallets = await db.query(
    `SELECT id, user_id, balance, wallet_name, currency, provider, created_at 
     FROM wallets WHERE user_id = $1`,
    [userId]
  );

  // 3. Get linked external wallets (banks, mobile money)
  const linkedWallets = await db.query(
    `SELECT lw.id, lw.provider_id, lw.account_number, lw.account_name, lw.wallet_name,
            COALESCE(wb.balance, lw.balance, 0) as balance,
            COALESCE(wb.currency, lw.currency, 'SLE') as currency,
            lw.is_active, lw.last_sync, lw.created_at
     FROM linked_wallets lw
     LEFT JOIN wallet_balances wb ON wb.linked_wallet_id = lw.id
     WHERE lw.user_id = $1 AND lw.is_active = true`,
    [userId]
  );

  // 4. Get wallet_transactions (all wallet movement ledger)
  const walletTxns = await db.query(
    `SELECT wt.* FROM wallet_transactions wt
     WHERE wt.user_id = $1 AND wt.status = 'completed'
     ORDER BY wt.created_at DESC LIMIT 100`,
    [userId]
  );

  // 5. Get regular transactions (SimplePay transfers)
  const regularTxns = await db.query(
    `SELECT t.*, tp.purpose
     FROM transactions t
     LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
     WHERE (t.sender_user_id = $1 OR t.receiver_identifier = $2)
       AND t.status = 'completed'
     ORDER BY t.created_at DESC LIMIT 100`,
    [userId, simplepayNumber]
  );

  // 6. Get savings data
  const savingsResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total_saved, COUNT(*) as deposit_count
     FROM savings_transactions WHERE user_id = $1 AND type = 'deposit'`,
    [userId]
  );

  // 7. Get savings goals
  const goals = await db.query(
    `SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
    [userId]
  );

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

/**
 * Compute total available funds across ALL wallets.
 */
function computeTotalBalance(ctx) {
  let total = 0;
  const breakdown = [];

  // SimplePay wallets
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

  // Linked wallets (banks, mobile money)
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

/**
 * Analyze wallet activity: most used, transaction counts, money movement.
 */
function computeWalletActivity(ctx) {
  const walletActivity = {};

  // Initialize all wallets
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

  // Count from wallet_transactions
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

  // Count from regular transactions (SimplePay sends/receives)
  for (const txn of ctx.regularTxns) {
    const isSender = txn.sender_user_id === ctx.userId;
    const isReceiver = txn.receiver_identifier === ctx.simplepayNumber && txn.sender_user_id !== ctx.userId;

    // Find SimplePay wallet in activity
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

  const mostActive = activityList[0] || null;

  return {
    wallets: activityList,
    mostActive,
    totalWallets: activityList.length,
  };
}

/**
 * Compute money received (inflow) analysis across all wallets.
 */
function computeMoneyReceived(ctx) {
  let totalReceived = 0;
  let transactionCount = 0;
  const sources = {};

  // From wallet_transactions (credits/transfers_in)
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

  // From regular transactions (received by SimplePay number)
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

/**
 * Compute money sent (outflow/spending) analysis across all wallets.
 */
function computeMoneySent(ctx) {
  let totalSent = 0;
  let transactionCount = 0;
  const destinations = {};
  const categories = {};

  // From wallet_transactions (debits/transfers_out)
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

  // From regular transactions (SimplePay sends)
  for (const txn of ctx.regularTxns) {
    if (txn.sender_user_id === ctx.userId && (txn.fee > 0 || txn.to_provider !== 'simplepay')) {
      const amount = Number(txn.amount || 0);
      totalSent += amount;
      transactionCount++;
      const dest = txn.to_provider || 'unknown';
      if (!destinations[dest]) destinations[dest] = { total: 0, count: 0 };
      destinations[dest].total += amount;
      destinations[dest].count++;

      // Categorize by purpose
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

/**
 * Compute savings analysis.
 */
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

/**
 * Compute financial health score (0-100).
 */
function computeHealthScore(ctx, balanceData, moneyReceived, moneySent, savingsAnalysis) {
  let score = 50; // baseline

  const totalBalance = balanceData.total;
  const totalSent = moneySent.totalSent;
  const totalReceived = moneyReceived.totalReceived;
  const totalSaved = savingsAnalysis.totalSaved;

  // Balance check
  if (totalBalance > 0) score += 5;
  if (totalBalance > 1000) score += 5;
  if (totalBalance > 5000) score += 5;

  // Income vs spending
  if (totalReceived > 0) score += 5;
  if (totalReceived > totalSent && totalSent > 0) score += 10;
  if (totalReceived > totalSent * 1.5) score += 5;

  // Savings
  if (totalSaved > 0) score += 10;
  if (totalSaved > totalSent * 0.1 && totalSent > 0) score += 5;
  if (totalSaved > totalSent * 0.2 && totalSent > 0) score += 5;

  // Goals
  if (savingsAnalysis.goalsCount > 0) score += 5;
  if (savingsAnalysis.completedGoals > 0) score += 5;
  if (savingsAnalysis.overallProgress >= 50) score += 5;

  // Wallet diversity (having multiple wallets = good financial management)
  if (balanceData.breakdown.length >= 2) score += 3;
  if (balanceData.breakdown.length >= 3) score += 2;

  // Transaction activity
  const totalTxns = moneyReceived.transactionCount + moneySent.transactionCount;
  if (totalTxns > 5) score += 3;
  if (totalTxns > 20) score += 2;

  return Math.min(100, Math.max(0, score));
}

/**
 * Generate smart insights based on multi-wallet data.
 */
function generateSmartInsights(ctx, balanceData, walletActivity, moneyReceived, moneySent, savingsAnalysis, healthScore) {
  const insights = [];

  // Multi-wallet overview insight
  if (balanceData.breakdown.length > 1) {
    const richest = balanceData.breakdown.sort((a, b) => b.balance - a.balance)[0];
    insights.push({
      type: 'info',
      title: 'Wallet Overview',
      message: `You have ${balanceData.breakdown.length} connected wallets with a total of NLe ${balanceData.total.toLocaleString()}. Your ${richest.name} holds the most at NLe ${richest.balance.toLocaleString()}.`,
    });
  }

  // Most active wallet
  if (walletActivity.mostActive && walletActivity.mostActive.totalTransactions > 0) {
    insights.push({
      type: 'info',
      title: 'Most Active Wallet',
      message: `Your most active wallet is ${walletActivity.mostActive.name} with ${walletActivity.mostActive.totalTransactions} transactions this period.`,
    });
  }

  // Spending category insight
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

  // Income vs spending
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

  // Savings insights
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

  // Health score insight
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Improvement';
  insights.push({
    type: healthScore >= 60 ? 'success' : 'warning',
    title: `Financial Health: ${scoreLabel}`,
    message: `Your score is ${healthScore}/100. ${getHealthAdvice(healthScore)}`,
  });

  // Monthly comparison (if we have enough data)
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
  return 'Focus on reducing spending, increasing savings, and diversifying your wallet management.';
}

/**
 * Build the complete financial overview (top-level aggregation).
 */
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

/**
 * Build a simplified context object for the LLM/AI chat.
 */
async function buildChatContext(userId) {
  const overview = await getFinancialOverview(userId);
  
  return {
    // Balance overview
    total_balance: overview.totalBalance,
    wallet_count: overview.totalWallets,
    wallets: overview.walletBreakdown.map(w => ({
      name: w.name,
      provider: w.provider,
      type: w.type,
      balance: w.balance,
      currency: w.currency,
    })),

    // Wallet activity
    most_active_wallet: overview.walletActivity.mostActive
      ? {
          name: overview.walletActivity.mostActive.name,
          transactions: overview.walletActivity.mostActive.totalTransactions,
          sentVolume: overview.walletActivity.mostActive.sentVolume,
          receivedVolume: overview.walletActivity.mostActive.receivedVolume,
        }
      : null,
    all_wallet_activity: overview.walletActivity.wallets.map(w => ({
      name: w.name,
      provider: w.provider,
      sentCount: w.sentCount,
      receivedCount: w.receivedCount,
      sentVolume: w.sentVolume,
      receivedVolume: w.receivedVolume,
    })),

    // Money received
    total_received: overview.moneyReceived.totalReceived,
    received_transaction_count: overview.moneyReceived.transactionCount,
    average_received: overview.moneyReceived.averageReceived,
    received_sources: overview.moneyReceived.sources,

    // Money sent
    total_sent: overview.moneySent.totalSent,
    sent_transaction_count: overview.moneySent.transactionCount,
    average_sent: overview.moneySent.averageSent,
    spending_categories: overview.moneySent.categories,
    spending_destinations: overview.moneySent.destinations,

    // Savings
    total_saved: overview.savings.totalSaved,
    savings_deposit_count: overview.savings.depositCount,
    goals_count: overview.savings.goalsCount,
    active_goals: overview.savings.activeGoals,
    completed_goals: overview.savings.completedGoals,
    savings_progress: overview.savings.overallProgress,
    goals: overview.savings.goals.map(g => ({
      name: g.name,
      target: g.targetAmount,
      current: g.currentAmount,
      progress: g.progress,
      remaining: g.remaining,
    })),

    // Health
    health_score: overview.healthScore,
    health_label: overview.healthScore >= 80 ? 'Excellent' : overview.healthScore >= 60 ? 'Good' : overview.healthScore >= 40 ? 'Fair' : 'Needs Improvement',

    // Insights
    smart_insights: overview.insights,
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
