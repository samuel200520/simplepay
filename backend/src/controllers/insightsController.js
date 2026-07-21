const db = require('../db');

const CONVERSATION_TABLE = `
  CREATE TABLE IF NOT EXISTS conversation_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`;

async function ensureConversationTable() {
  try {
    await db.query(CONVERSATION_TABLE);
  } catch (err) {
    console.error('Conversation history table check failed:', err.message);
  }
}

async function getConversationHistory(userId, limit = 20) {
  await ensureConversationTable();
  const result = await db.query(
    'SELECT role, content FROM conversation_history WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2',
    [userId, limit]
  );
  return result.rows.map(r => ({ role: r.role, content: r.content }));
}

async function saveMessage(userId, role, content) {
  await ensureConversationTable();
  await db.query('INSERT INTO conversation_history (user_id, role, content) VALUES ($1, $2, $3)', [userId, role, content]);
}

async function clearConversation(userId) {
  await ensureConversationTable();
  await db.query('DELETE FROM conversation_history WHERE user_id = $1', [userId]);
}

function buildFinancialContext(userId) {
  return db.query(`
    WITH wallet_balance AS (
      SELECT COALESCE(SUM(balance), 0) as balance FROM wallets WHERE user_id = $1
    ),
    total_spent AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE sender_user_id = $1 AND fee > 0
    ),
    total_received AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE receiver_identifier = (SELECT simplepay_account_number FROM users WHERE id = $1) 
        AND sender_user_id != $1
    ),
    monthly_spending AS (
      SELECT COALESCE(purpose, 'Other') as category, SUM(amount) as total
      FROM transactions WHERE sender_user_id = $1 AND fee > 0
      GROUP BY COALESCE(purpose, 'Other')
      ORDER BY total DESC LIMIT 5
    ),
    monthly_income AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE receiver_identifier = (SELECT simplepay_account_number FROM users WHERE id = $1) 
        AND sender_user_id != $1
    ),
    savings AS (
      SELECT COALESCE(SUM(amount), 0) as total_saved, COUNT(*) as deposit_count
      FROM savings_transactions WHERE user_id = $1 AND type = 'deposit'
    ),
    goals AS (
      SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 10
    ),
    recent_transactions AS (
      SELECT * FROM transactions WHERE sender_user_id = $1 ORDER BY created_at DESC LIMIT 5
    )
    SELECT 
      (SELECT balance FROM wallet_balance) as wallet_balance,
      (SELECT total FROM total_spent) as total_spent,
      (SELECT total FROM total_received) as total_received,
      (SELECT total FROM monthly_income) as monthly_income,
      (SELECT total_saved FROM savings) as total_saved,
      (SELECT deposit_count FROM savings) as deposit_count,
      (SELECT array_agg(row_to_json(m) ORDER BY m.total DESC) FROM monthly_spending m) as spending_breakdown,
      (SELECT array_agg(row_to_json(g) ORDER BY g.created_at DESC) FROM goals g) as goals,
      (SELECT array_agg(row_to_json(t) ORDER BY t.created_at DESC) FROM recent_transactions t) as recent_transactions
  `, [userId]);
}

exports.getInsights = async (req, res) => {
  const userId = req.user.userId;
  try {
    const userResult = await db.query('SELECT simplepay_account_number FROM users WHERE id = $1', [userId]);
    const simplepayNumber = userResult.rows[0]?.simplepay_account_number;

    const spendingResult = await db.query(
      `SELECT COALESCE(purpose, 'Other') as category, SUM(amount) as total
       FROM transactions WHERE sender_user_id = $1 AND fee > 0
       GROUP BY COALESCE(purpose, 'Other') ORDER BY total DESC LIMIT 10`,
      [userId]
    );

    const monthlyResult = await db.query(
      `SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as total_spent, SUM(fee) as total_fees, COUNT(*) as transaction_count
       FROM transactions WHERE sender_user_id = $1 AND fee > 0
       GROUP BY DATE_TRUNC('month', created_at) ORDER BY month DESC LIMIT 3`,
      [userId]
    );

    const savingsResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_saved, COUNT(*) as deposit_count
       FROM savings_transactions WHERE user_id = $1 AND type = 'deposit'`,
      [userId]
    );

    const goalsResult = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );

    const totalTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume FROM transactions WHERE sender_user_id = $1 AND fee > 0`,
      [userId]
    );

    const receivedTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume FROM transactions WHERE receiver_identifier = $1 AND sender_user_id != $1`,
      [simplepayNumber]
    );

    const healthScore = calculateHealthScore({
      totalSpent: Number(totalTxns.rows[0]?.volume || 0),
      totalReceived: Number(receivedTxns.rows[0]?.volume || 0),
      totalSaved: Number(savingsResult.rows[0]?.total_saved || 0),
      transactionCount: Number(totalTxns.rows[0]?.count || 0),
      goalsCount: goalsResult.rows.length,
      goalsCompleted: goalsResult.rows.filter(g => Number(g.current_amount) >= Number(g.target_amount)).length,
    });

    const insights = generateInsights(spendingResult.rows, monthlyResult.rows, savingsResult.rows[0], goalsResult.rows, healthScore);

    res.json({
      health_score: healthScore,
      spending_breakdown: spendingResult.rows,
      monthly_stats: monthlyResult.rows,
      total_spent: Number(totalTxns.rows[0]?.volume || 0),
      total_received: Number(receivedTxns.rows[0]?.volume || 0),
      total_saved: Number(savingsResult.rows[0]?.total_saved || 0),
      savings_deposits: Number(savingsResult.rows[0]?.deposit_count || 0),
      goals: goalsResult.rows,
      insights,
    });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Could not fetch insights' });
  }
};

exports.chatWithCoach = async (req, res) => {
  const userId = req.user.userId;
  const { message, clear } = req.body;

  if (clear) {
    try {
      await clearConversation(userId);
      return res.json({ success: true, message: 'Conversation cleared.' });
    } catch (err) {
      console.error('Clear conversation error:', err);
      return res.status(500).json({ error: 'Could not clear conversation' });
    }
  }

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const context = await buildFinancialContext(userId);
    const financialContext = {
      wallet_balance: context.rows[0]?.wallet_balance || 0,
      total_spent: context.rows[0]?.total_spent || 0,
      total_received: context.rows[0]?.total_received || 0,
      monthly_income: context.rows[0]?.monthly_income || 0,
      total_saved: context.rows[0]?.total_saved || 0,
      deposit_count: context.rows[0]?.deposit_count || 0,
      spending_breakdown: context.rows[0]?.spending_breakdown || [],
      goals: context.rows[0]?.goals || [],
      recent_transactions: context.rows[0]?.recent_transactions || [],
    };

    const response = generateIntelligentResponse(message.trim(), financialContext);

    await saveMessage(userId, 'user', message.trim());
    await saveMessage(userId, 'assistant', response);

    res.json({ response });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Could not process your request. Please try again.' });
  }
};

function generateIntelligentResponse(message, ctx) {
  const lower = message.toLowerCase();

  if (containsAny(lower, ['spend', 'expense', 'how much', 'total', 'used'])) {
    return answerSpending(lower, ctx);
  }
  if (containsAny(lower, ['food'])) {
    return answerCategory('Food', ctx);
  }
  if (containsAny(lower, ['transport', 'travel'])) {
    return answerCategory('Transport', ctx);
  }
  if (containsAny(lower, ['save', 'saving', 'saved'])) {
    return answerSavings(ctx);
  }
  if (containsAny(lower, ['goal', 'target', 'reach', 'progress'])) {
    return answerGoals(ctx);
  }
  if (containsAny(lower, ['reduce', 'cut', 'save more', 'advice', 'recommend', 'budget', 'plan'])) {
    return answerAdvice(ctx);
  }
  if (containsAny(lower, ['afford', 'buy', 'laptop', 'expensive'])) {
    return answerAffordability(ctx);
  }
  if (containsAny(lower, ['biggest', 'largest', 'top', 'main', 'where'])) {
    return answerBiggestExpense(ctx);
  }
  if (containsAny(lower, ['income', 'received', 'earn', 'deposit'])) {
    return answerIncome(ctx);
  }
  if (containsAny(lower, ['health', 'score', 'rating'])) {
    return answerHealth(ctx);
  }
  if (containsAny(lower, ['hello', 'hi', 'hey', 'greet'])) {
    return "Hello! I'm your Smart Money Coach. I can see your wallet balance is NLe " + Number(ctx.wallet_balance || 0).toLocaleString() + ". Ask me about your spending, savings, or goals!";
  }

  return answerGeneral(ctx);
}

function answerSpending(lower, ctx) {
  if (!ctx.spending_breakdown || ctx.spending_breakdown.length === 0) {
    return "You haven't made any outgoing transactions yet. Once you start sending money, I'll be able to analyze your spending patterns and give you personalized insights.";
  }

  const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const top = ctx.spending_breakdown[0];
  const topPct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;

  if (lower.includes('month') || lower.includes('this month')) {
    return `This month you've spent a total of NLe ${total.toLocaleString()} across ${ctx.spending_breakdown.length} categories. Your biggest expense is ${top.category} at NLe ${Number(top.total).toLocaleString()} (${topPct}% of your spending).`;
  }

  return `You've spent a total of NLe ${total.toLocaleString()} across ${ctx.spending_breakdown.length} categories. ${top.category} is your biggest expense at NLe ${Number(top.total).toLocaleString()}, accounting for ${topPct}% of your total spending.`;
}

function answerCategory(category, ctx) {
  const cat = ctx.spending_breakdown.find(r => r.category.toLowerCase() === category.toLowerCase());
  if (!cat) {
    return "You haven't recorded any spending in that category yet. Add transaction purposes when sending money to get better insights.";
  }

  const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const pct = total > 0 ? ((Number(cat.total) / total) * 100).toFixed(0) : 0;

  return `Your ${category} spending is NLe ${Number(cat.total).toLocaleString()}. This represents ${pct}% of your total spending. ${getCategoryAdvice(category, Number(cat.total), pct)}`;
}

function getCategoryAdvice(category, amount, pct) {
  const advice = {
    'Food': amount > 1000 ? "This is relatively high. Consider meal planning to reduce food expenses." : "Your food spending is reasonable.",
    'Transport': amount > 800 ? "Transport costs are adding up. Consider carpooling or using public transport more often." : "Your transport expenses look manageable.",
    'School Fees': "Education is a great investment. Consider setting aside a fixed amount each month for school fees.",
    'Rent': "Housing is typically your biggest fixed expense. Make sure this fits comfortably within your budget.",
    'Medical': "Health is important. Consider setting aside an emergency fund for medical expenses.",
    'Business': "Business expenses can grow your income. Track ROI on these investments carefully.",
    'Family Support': "Supporting family is valuable. Ensure this doesn't compromise your own financial goals.",
    'Shopping': "Consider distinguishing between needs and wants before making purchases.",
    'Utilities': "Utilities are essential. Look for ways to reduce consumption where possible.",
    'Gift': "Gifts are thoughtful expenses. Budget for them to avoid surprises.",
    'Investment': "Great job investing! Diversify your investments for better risk management.",
    'Other': "Review these expenses to understand where your money is going."
  };
  return advice[category] || "Track this category to identify potential savings.";
}

function answerSavings(ctx) {
  if (!ctx.total_saved || ctx.total_saved <= 0) {
    return "You haven't started saving yet. Creating a savings goal is the first step towards building your financial future. Start with a small, achievable target.";
  }
  const monthly = ctx.total_received - ctx.total_spent;
  if (monthly > 0) {
    return "You've saved NLe " + Number(ctx.total_saved).toLocaleString() + " so far across all your goals. Your current monthly surplus is about NLe " + monthly.toLocaleString() + ". If you save this consistently, you could build a strong financial cushion. Consider setting up auto-save to make saving automatic.";
  }
  return "You've saved NLe " + Number(ctx.total_saved).toLocaleString() + " total. However, your monthly spending exceeds your income. Reducing expenses by NLe " + (ctx.total_spent - ctx.total_received).toLocaleString() + " would help you save more each month.";
}

function answerGoals(ctx) {
  if (!ctx.goals || ctx.goals.length === 0) {
    return "You don't have any savings goals yet. Goals give you something to work towards. Consider creating a goal for an emergency fund, school fees, or a major purchase.";
  }
  const updates = ctx.goals.map(g => {
    const progress = Math.round((Number(g.current_amount || 0) / Number(g.target_amount)) * 100);
    const remaining = Number(g.target_amount) - Number(g.current_amount || 0);
    return `${g.name}: ${progress}% complete (NLe ${remaining.toLocaleString()} remaining)`;
  }).join('. ');
  return `Here's your goals progress: ${updates}. ${getGoalAdvice(ctx.goals)}`;
}

function getGoalAdvice(goals) {
  const nearComplete = goals.find(g => {
    const progress = (Number(g.current_amount || 0) / Number(g.target_amount)) * 100;
    return progress >= 75;
  });
  if (nearComplete) {
    return `You're almost there! Just NLe ${(Number(nearComplete.target_amount) - Number(nearComplete.current_amount || 0)).toLocaleString()} to go. Keep it up!`;
  }
  const stalled = goals.find(g => Number(g.current_amount || 0) < Number(g.target_amount) * 0.2);
  if (stalled) {
    return `${stalled.name} is still early. Consider increasing your monthly contributions to reach it faster.`;
  }
  return "You're making good progress. Keep contributing regularly to reach your goals!";
}

function answerAdvice(ctx) {
  const parts = [];

  if (ctx.spending_breakdown && ctx.spending_breakdown.length > 0) {
    const top = ctx.spending_breakdown[0];
    const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const topPct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;
    const potential = Math.round(Number(top.total) * 0.15);
    parts.push(`Your biggest expense is ${top.category} at NLe ${Number(top.total).toLocaleString()} (${topPct}% of spending). Reducing it by 15% could save approximately NLe ${potential.toLocaleString()} monthly.`);
  }

  if (ctx.total_spent > ctx.total_received && ctx.total_received > 0) {
    parts.push(`You're currently spending more than you receive. Your monthly deficit is about NLe ${(ctx.total_spent - ctx.total_received).toLocaleString()}. Consider cutting non-essential expenses.`);
  } else if (ctx.total_received > ctx.total_spent) {
    const surplus = ctx.total_received - ctx.total_spent;
    parts.push(`Good news: you have a monthly surplus of about NLe ${surplus.toLocaleString()}. You could save this amount or invest it.`);
  }

  if (ctx.total_saved > 0) {
    parts.push("You're already saving, which is great! Consider setting up automatic transfers to make saving effortless.");
  } else {
    parts.push("Start by saving just 10% of your income. Small amounts add up over time.");
  }

  if (ctx.goals && ctx.goals.length > 0) {
    const goalNames = ctx.goals.slice(0, 3).map(g => g.name).join(', ');
    parts.push(`For your goals (${goalNames}), try setting aside a fixed amount each month.`);
  }

  return parts.join(' ');
}

function answerAffordability(ctx) {
  const monthlySurplus = ctx.total_received - ctx.total_spent;
  if (monthlySurplus > 0) {
    return "Based on your current monthly surplus of NLe " + monthlySurplus.toLocaleString() + ", you could afford to save some money. However, I'd need to know the specific cost to give you accurate advice. Try creating a savings goal for it!";
  }
  return "Right now, your monthly spending exceeds your income. To afford a new purchase, you'd need to reduce expenses or increase income first. Consider reviewing your spending categories to find areas to cut back.";
}

function answerBiggestExpense(ctx) {
  if (!ctx.spending_breakdown || ctx.spending_breakdown.length === 0) {
    return "You don't have enough transaction data yet to identify spending patterns. Keep using the app and I'll be able to analyze your expenses.";
  }
  const top = ctx.spending_breakdown[0];
  const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const pct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;

  return `Your biggest expense is ${top.category} at NLe ${Number(top.total).toLocaleString()}. That's ${pct}% of your total spending. ${getCategoryAdvice(top.category, Number(top.total), pct)}`;
}

function answerIncome(ctx) {
  if (!ctx.total_received || ctx.total_received <= 0) {
    return "You haven't recorded any incoming transactions yet. When someone sends you money, it will show up here.";
  }
  return "You've received NLe " + Number(ctx.total_received).toLocaleString() + " total. Your savings rate is " + (ctx.total_received > 0 ? ((ctx.total_saved / ctx.total_received) * 100).toFixed(0) : 0) + "% of your income. " + (ctx.total_saved > 0 ? "Great job saving!" : "Consider starting a savings goal today.");
}

function answerHealth(ctx) {
  const score = calculateHealthScore({
    totalSpent: ctx.total_spent,
    totalReceived: ctx.total_received,
    totalSaved: ctx.total_saved,
    transactionCount: ctx.deposit_count,
    goalsCount: ctx.goals ? ctx.goals.length : 0,
    goalsCompleted: ctx.goals ? ctx.goals.filter(g => Number(g.current_amount) >= Number(g.target_amount)).length : 0,
  });

  let advice = "";
  if (score >= 80) advice = "Excellent! You're managing your finances well. Keep maintaining these healthy habits.";
  else if (score >= 60) advice = "Good progress! Focus on building your emergency fund and sticking to a budget.";
  else advice = "There's room for improvement. Start tracking expenses, create savings goals, and try to reduce unnecessary spending.";

  return `Your financial health score is ${score}/100. ${advice}`;
}

function answerGeneral(ctx) {
  const parts = [];
  if (ctx.spending_breakdown && ctx.spending_breakdown.length > 0) {
    const top = ctx.spending_breakdown[0];
    parts.push(`Your top spending category is ${top.category} at NLe ${Number(top.total).toLocaleString()}.`);
  }
  if (ctx.total_saved > 0) {
    parts.push(`You've saved NLe ${Number(ctx.total_saved).toLocaleString()} so far.`);
  }
  if (ctx.goals && ctx.goals.length > 0) {
    parts.push(`You have ${ctx.goals.length} active savings goals.`);
  }
  if (parts.length === 0) {
    return "I'm here to help you manage your finances. Try asking me about your spending, savings goals, or budget advice.";
  }
  return parts.join(' ') + " What would you like to focus on?";
}

function containsAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function calculateHealthScore({ totalSpent, totalReceived, totalSaved, transactionCount, goalsCount, goalsCompleted }) {
  let score = 50;
  if (totalSaved > 0) score += 15;
  if (totalSaved > totalSpent * 0.1) score += 10;
  if (transactionCount > 5) score += 5;
  if (transactionCount > 20) score += 5;
  if (goalsCount > 0) score += 10;
  if (goalsCompleted > 0) score += 5;
  if (totalReceived > 0) score += 5;
  return Math.min(100, Math.max(0, score));
}

function generateInsights(spending, monthly, savings, goals, healthScore) {
  const insights = [];

  if (monthly.length >= 2) {
    const current = Number(monthly[0].total_spent || 0);
    const previous = Number(monthly[1].total_spent || 0);
    if (previous > 0) {
      const change = ((current - previous) / previous) * 100;
      if (change > 10) {
        insights.push({ type: 'warning', title: 'Monthly Analysis', message: `You spent ${change.toFixed(0)}% more this month compared to last month.` });
      } else if (change < -10) {
        insights.push({ type: 'success', title: 'Monthly Analysis', message: `Great job! You spent ${Math.abs(change).toFixed(0)}% less this month.` });
      }
    }
  }

  if (spending.length > 0) {
    const top = spending[0];
    const total = spending.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const pct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;
    let advice = "";
    if (pct > 40) advice = " This is quite high. Consider reducing this category.";
    else if (pct > 25) advice = " This is moderate. Small reductions could add up to significant savings.";
    insights.push({ type: 'insight', title: 'Top Spending Category', message: `${top.category} is your biggest expense at NLe ${Number(top.total).toLocaleString()} (${pct}% of spending).${advice}` });
  }

  if (savings && Number(savings.total_saved) > 0) {
    insights.push({ type: 'success', title: 'Savings', message: `You're saving consistently. Total saved: NLe ${Number(savings.total_saved).toLocaleString()}.` });
  }

  if (goals.length > 0) {
    goals.forEach(goal => {
      const progress = Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100);
      const remaining = Number(goal.target_amount) - Number(goal.current_amount);
      if (remaining > 0 && remaining < 500) {
        insights.push({ type: 'goal', title: 'Goal Reminder', message: `Only NLe ${remaining.toLocaleString()} left to reach your ${goal.name} goal!` });
      }
    });
  }

  if (healthScore >= 80) {
    insights.push({ type: 'success', title: 'Financial Health', message: `Excellent! Your financial health score is ${healthScore}/100.` });
  } else if (healthScore >= 60) {
    insights.push({ type: 'insight', title: 'Financial Health', message: `Good progress! Your financial health score is ${healthScore}/100. Keep saving!` });
  }

  return insights;
}

exports.budgetRecommendations = async (req, res) => {
  const userId = req.user.userId;
  try {
    const context = await buildFinancialContext(userId);
    const ctx = {
      wallet_balance: context.rows[0]?.wallet_balance || 0,
      total_spent: context.rows[0]?.total_spent || 0,
      total_received: context.rows[0]?.total_received || 0,
      monthly_income: context.rows[0]?.monthly_income || 0,
      total_saved: context.rows[0]?.total_saved || 0,
      spending_breakdown: context.rows[0]?.spending_breakdown || [],
      goals: context.rows[0]?.goals || [],
    };

    const monthlyIncome = ctx.monthly_income || ctx.total_received || 0;
    const monthlyExpenses = ctx.total_spent || 0;
    const totalSaved = ctx.total_saved || 0;
    const balance = ctx.wallet_balance || 0;

    const categories = {};
    ctx.spending_breakdown.forEach(r => {
      categories[r.category] = Number(r.total || 0);
    });

    const emergencyFund = monthlyExpenses * 3;
    const emergencyFundProgress = totalSaved > 0 ? Math.min(100, (totalSaved / emergencyFund) * 100) : 0;

    const recommendations = [];
    Object.keys(categories).forEach(cat => {
      const current = categories[cat];
      const percentage = monthlyIncome > 0 ? (current / monthlyIncome) * 100 : 0;
      let recommended = current;
      let suggestion = '';

      if (percentage > 40) {
        recommended = current * 0.7;
        suggestion = `Reduce by NLe ${(current - recommended).toLocaleString()} to bring this to a healthier level.`;
      } else if (percentage > 25) {
        recommended = current * 0.85;
        suggestion = `Consider reducing by NLe ${(current - recommended).toLocaleString()} for better balance.`;
      } else if (percentage < 10 && cat !== 'Investment') {
        recommended = current * 1.2;
        suggestion = `You're doing well here. This category is well within budget.`;
      }

      recommendations.push({
        category: cat,
        current: current,
        recommended: Math.round(recommended),
        percentage: percentage.toFixed(0),
        suggestion,
      });
    });

    const recommendedMonthlySavings = monthlyIncome > 0 ? monthlyIncome * 0.2 : 0;
    const currentSavingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;

    res.json({
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      current_balance: balance,
      total_saved: totalSaved,
      recommended_monthly_savings: Math.round(recommendedMonthlySavings),
      current_savings_rate: currentSavingsRate.toFixed(0),
      emergency_fund_target: Math.round(emergencyFund),
      emergency_fund_progress: emergencyFundProgress.toFixed(0),
      recommendations,
    });
  } catch (err) {
    console.error('Budget recommendations error:', err);
    res.status(500).json({ error: 'Could not generate budget recommendations' });
  }
};

exports.clearChatHistory = async (req, res) => {
  const userId = req.user.userId;
  try {
    await clearConversation(userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Clear chat history error:', err);
    res.status(500).json({ error: 'Could not clear chat history' });
  }
};

exports.getChatHistory = async (req, res) => {
  const userId = req.user.userId;
  try {
    const history = await getConversationHistory(userId, 50);
    res.json({ history });
  } catch (err) {
    console.error('Get chat history error:', err);
    res.status(500).json({ error: 'Could not fetch chat history' });
  }
};
