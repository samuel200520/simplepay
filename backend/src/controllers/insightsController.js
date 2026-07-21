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
    WITH 
    wallet_balance AS (
      SELECT COALESCE(SUM(balance), 0) as balance FROM wallets WHERE user_id = $1
    ),
    total_spent AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE sender_user_id = $1 AND status = 'completed' AND (fee > 0 OR to_provider != 'simplepay')
    ),
    total_received_external AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE receiver_identifier = (SELECT simplepay_account_number FROM users WHERE id = $1) 
        AND sender_user_id != $1 AND status = 'completed'
    ),
    total_received_internal AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE sender_user_id = $1 AND status = 'completed' AND fee = 0 AND to_provider = 'simplepay'
    ),
    monthly_spending AS (
      SELECT COALESCE(tp.purpose, 'Other') as category, SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
      WHERE t.sender_user_id = $1 AND t.status = 'completed' AND (t.fee > 0 OR t.to_provider != 'simplepay')
      GROUP BY COALESCE(tp.purpose, 'Other')
      ORDER BY total DESC LIMIT 10
    ),
    monthly_income AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE receiver_identifier = (SELECT simplepay_account_number FROM users WHERE id = $1) 
        AND sender_user_id != $1 AND status = 'completed'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    monthly_income_internal AS (
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE sender_user_id = $1 AND status = 'completed' AND fee = 0 AND to_provider = 'simplepay'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    savings AS (
      SELECT COALESCE(SUM(amount), 0) as total_saved, COUNT(*) as deposit_count
      FROM savings_transactions WHERE user_id = $1 AND type = 'deposit'
    ),
    goals AS (
      SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 10
    ),
    recent_transactions AS (
      SELECT t.*, tp.purpose 
      FROM transactions t
      LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
      WHERE t.sender_user_id = $1 AND t.status = 'completed'
      ORDER BY t.created_at DESC LIMIT 5
    )
    SELECT 
      (SELECT balance FROM wallet_balance) as wallet_balance,
      (SELECT total FROM total_spent) as total_spent,
      (SELECT total FROM total_received_external) as total_received_external,
      (SELECT total FROM total_received_internal) as total_received_internal,
      (SELECT total FROM monthly_income) as monthly_income,
      (SELECT total FROM monthly_income_internal) as monthly_income_internal,
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
      `SELECT COALESCE(tp.purpose, 'Other') as category, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
       WHERE t.sender_user_id = $1 AND t.status = 'completed' AND (t.fee > 0 OR t.to_provider != 'simplepay')
       GROUP BY COALESCE(tp.purpose, 'Other') ORDER BY total DESC LIMIT 10`,
      [userId]
    );

    const monthlyResult = await db.query(
      `SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as total_spent, SUM(fee) as total_fees, COUNT(*) as transaction_count
       FROM transactions WHERE sender_user_id = $1 AND status = 'completed' AND (fee > 0 OR to_provider != 'simplepay')
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
      `SELECT COUNT(*) as count, SUM(amount) as volume FROM transactions WHERE sender_user_id = $1 AND status = 'completed' AND (fee > 0 OR to_provider != 'simplepay')`,
      [userId]
    );

    const receivedTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume FROM transactions 
       WHERE receiver_identifier = $1 AND sender_user_id != $1 AND status = 'completed'`,
      [simplepayNumber]
    );

    const internalReceivedTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume FROM transactions 
       WHERE sender_user_id = $1 AND status = 'completed' AND fee = 0 AND to_provider = 'simplepay'`,
      [userId]
    );

    const totalReceivedVolume = Number(receivedTxns.rows[0]?.volume || 0) + Number(internalReceivedTxns.rows[0]?.volume || 0);

    const healthScore = calculateHealthScore({
      totalSpent: Number(totalTxns.rows[0]?.volume || 0),
      totalReceived: totalReceivedVolume,
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
      total_received: totalReceivedVolume,
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
      total_received: (Number(context.rows[0]?.total_received_external || 0) + Number(context.rows[0]?.total_received_internal || 0)),
      monthly_income: (Number(context.rows[0]?.monthly_income || 0) + Number(context.rows[0]?.monthly_income_internal || 0)),
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

  if (containsAny(lower, ['hello', 'hi', 'hey', 'greet'])) {
    return "Hello! I'm your Smart Money Coach. I can see your wallet balance is NLe " + Number(ctx.wallet_balance || 0).toLocaleString() + ". Ask me about your spending, savings, or goals!";
  }
  if (containsAny(lower, ['health', 'score', 'rating'])) {
    return answerHealth(ctx);
  }
  if (containsAny(lower, ['afford', 'buy', 'laptop', 'expensive', 'cost', 'price'])) {
    return answerAffordability(lower, ctx);
  }
  if (containsAny(lower, ['spend', 'expense', 'how much', 'total', 'used'])) {
    return answerSpending(lower, ctx);
  }
  if (containsAny(lower, ['biggest', 'largest', 'top', 'main', 'where is most', 'where does'])) {
    return answerBiggestExpense(ctx);
  }
  if (containsAny(lower, ['busines'])) {
    return answerCategory('Business', ctx);
  }
  if (containsAny(lower, ['food'])) {
    return answerCategory('Food', ctx);
  }
  if (containsAny(lower, ['transport', 'travel'])) {
    return answerCategory('Transport', ctx);
  }
  if (containsAny(lower, ['rent'])) {
    return answerCategory('Rent', ctx);
  }
  if (containsAny(lower, ['shopping'])) {
    return answerCategory('Shopping', ctx);
  }
  if (containsAny(lower, ['medical', 'health'])) {
    return answerCategory('Medical', ctx);
  }
  if (containsAny(lower, ['family'])) {
    return answerCategory('Family Support', ctx);
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
  if (containsAny(lower, ['income', 'received', 'earn', 'deposit'])) {
    return answerIncome(ctx);
  }
  if (containsAny(lower, ['week', 'weekly', 'month', 'monthly', 'year', 'yearly', 'trend'])) {
    return answerTrend(ctx);
  }
  if (containsAny(lower, ['tip', 'tips'])) {
    return answerTips(ctx);
  }
  if (containsAny(lower, ['saving tips'])) {
    return answerTips(ctx);
  }
  if (containsAny(lower, ['analyze', 'analysis', 'overview', 'summary'])) {
    return answerAnalysis(ctx);
  }

  return answerGeneral(ctx);
}

function extractAmount(text) {
  const match = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

function answerSpending(lower, ctx) {
  if (!ctx.spending_breakdown || ctx.spending_breakdown.length === 0) {
    return "You haven't made any outgoing transactions yet. Once you start sending money, I'll be able to analyze your spending patterns and give you personalized insights.";
  }

  const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const top = ctx.spending_breakdown[0];
  const topPct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;

  if (lower.includes('month') || lower.includes('this month')) {
    return `This month you've spent a total of NLe ${total.toLocaleString()} across ${ctx.spending_breakdown.length} categories. Your biggest expense is ${top.category} at NLe ${Number(top.total).toLocaleString()} (${topPct}% of your spending). Would you like me to suggest ways to reduce this?`;
  }

  return `You've spent a total of NLe ${total.toLocaleString()} across ${ctx.spending_breakdown.length} categories. ${top.category} is your biggest expense at NLe ${Number(top.total).toLocaleString()}, accounting for ${topPct}% of your total spending. Would you like a breakdown by category or some saving tips?`;
}

function answerCategory(category, ctx) {
  const cat = ctx.spending_breakdown.find(r => r.category.toLowerCase() === category.toLowerCase());
  if (!cat) {
    return "You haven't recorded any spending in that category yet. Add transaction purposes when sending money to get better insights.";
  }

  const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const pct = total > 0 ? ((Number(cat.total) / total) * 100).toFixed(0) : 0;
  const monthlyAvg = total > 0 ? (Number(cat.total) / Math.max(1, Math.ceil(total / Number(ctx.monthly_income || 1)))) : 0;

  return `Your ${category} spending is NLe ${Number(cat.total).toLocaleString()}. This represents ${pct}% of your total spending. ${getCategoryAdvice(category, Number(cat.total), pct)} Would you like me to help you plan a budget for this category?`;
}

function getCategoryAdvice(category, amount, pct) {
  const advice = {
    'Food': amount > 1000 ? "This is relatively high. Consider meal planning and cooking at home more often to bring this down." : "Your food spending looks reasonable. Keep tracking to stay on top of it.",
    'Transport': amount > 800 ? "Transport costs are adding up. Consider carpooling, using public transport, or planning your trips more efficiently." : "Your transport expenses look manageable.",
    'School Fees': "Education is a great investment. Consider setting aside a fixed amount each month for school fees so it doesn't strain your budget.",
    'Rent': "Housing is typically your biggest fixed expense. Make sure this fits comfortably within 30% of your monthly income.",
    'Medical': "Health is important. Consider setting aside an emergency fund specifically for medical expenses so unexpected bills don't derail your finances.",
    'Business': "Business expenses can grow your income. Track ROI on these investments carefully and ensure they're generating returns.",
    'Family Support': "Supporting family is valuable. Ensure this doesn't compromise your own financial goals. Consider setting a monthly limit.",
    'Shopping': "Consider distinguishing between needs and wants before making purchases. The 24-hour rule can help reduce impulse buying.",
    'Utilities': "Utilities are essential. Look for ways to reduce consumption where possible, such as switching to energy-efficient options.",
    'Gift': "Gifts are thoughtful expenses. Budget for them quarterly to avoid surprises during festive seasons.",
    'Investment': "Great job investing! Diversify your investments for better risk management and review your portfolio regularly.",
    'Other': "Review these expenses to understand where your money is going. Small unexplained expenses can add up to significant amounts over time."
  };
  return advice[category] || "Track this category to identify potential savings.";
}

function answerSavings(ctx) {
  if (!ctx.total_saved || ctx.total_saved <= 0) {
    if (ctx.goals && ctx.goals.length > 0) {
      return "You have savings goals but haven't made any deposits yet. Start with a small amount you're comfortable with. Even NLe 50 a week adds up to NLe 2,600 a year. The key is consistency.";
    }
    return "You haven't started saving yet. Creating a savings goal is the first step towards building your financial future. Start with a small, achievable target and build from there.";
  }
  const monthly = ctx.monthly_income - ctx.total_spent;
  const savingsRate = ctx.monthly_income > 0 ? ((ctx.monthly_income - ctx.total_spent) / ctx.monthly_income) * 100 : 0;
  if (monthly > 0) {
    return "You've saved NLe " + Number(ctx.total_saved).toLocaleString() + " so far across all your goals. Your current monthly surplus is about NLe " + monthly.toLocaleString() + " with a savings rate of " + savingsRate.toFixed(0) + "%. If you save this consistently, you could build a strong financial cushion. Consider setting up auto-save to make saving automatic.";
  }
  return "You've saved NLe " + Number(ctx.total_saved).toLocaleString() + " total. However, your monthly spending exceeds your income. Reducing expenses by NLe " + (ctx.total_spent - ctx.monthly_income).toLocaleString() + " would help you save more each month. Let me know if you'd like a personalized plan to get back on track.";
}

function answerGoals(ctx) {
  if (!ctx.goals || ctx.goals.length === 0) {
    return "You don't have any savings goals yet. Goals give you something to work towards. Consider creating a goal for an emergency fund, school fees, or a major purchase. I can help you build a plan once you set one up.";
  }
  const updates = ctx.goals.map(g => {
    const progress = Math.round((Number(g.current_amount || 0) / Number(g.target_amount)) * 100);
    const remaining = Number(g.target_amount) - Number(g.current_amount || 0);
    return `${g.name}: ${progress}% complete (NLe ${remaining.toLocaleString()} remaining)`;
  }).join('. ');
  return `Here's your goals progress: ${updates}. ${getGoalAdvice(ctx.goals)} Would you like me to calculate how much you should save each month to reach these goals faster?`;
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

  if (ctx.total_spent > ctx.monthly_income && ctx.monthly_income > 0) {
    parts.push(`You're currently spending more than your monthly income. Your deficit is about NLe ${(ctx.total_spent - ctx.monthly_income).toLocaleString()}. Consider cutting non-essential expenses.`);
  } else if (ctx.monthly_income > ctx.total_spent) {
    const surplus = ctx.monthly_income - ctx.total_spent;
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

function answerAffordability(lower, ctx) {
  const cost = extractAmount(lower);
  const monthlySurplus = ctx.monthly_income - ctx.total_spent;
  const available = ctx.wallet_balance + ctx.total_saved;

  if (monthlySurplus > 0) {
    if (cost) {
      if (available >= cost) {
        const monthsFromSavings = Math.ceil(cost / Math.max(1, monthlySurplus));
        return `Good news! You can afford this. You have NLe ${available.toLocaleString()} available (NLe ${ctx.wallet_balance.toLocaleString()} in wallet + NLe ${ctx.total_saved.toLocaleString()} in savings). If you save your monthly surplus of NLe ${monthlySurplus.toLocaleString()}, you could reach this goal in about ${monthsFromSavings} months. I recommend creating a savings goal to track it!`;
      } else {
        const shortfall = cost - available;
        const months = Math.ceil(shortfall / Math.max(1, monthlySurplus));
        return `That costs NLe ${cost.toLocaleString()}. You currently have NLe ${available.toLocaleString()} available. You're short by NLe ${shortfall.toLocaleString()}. At your current savings rate of NLe ${monthlySurplus.toLocaleString()}/month, you could reach this goal in approximately ${months} months. Consider creating a dedicated savings goal to make this happen!`;
      }
    }
    return `Based on your current monthly surplus of NLe ${monthlySurplus.toLocaleString()}, you could afford to save for this. You have NLe ${available.toLocaleString()} total available. How much does it cost? I can give you a precise timeline once I know the amount.`;
  }
  if (cost) {
    return `That costs NLe ${cost.toLocaleString()}. Right now, your monthly spending exceeds your income, so you'd need to reduce expenses first. Consider reviewing your spending categories to find areas to cut back, then focus on saving NLe ${Math.max(1, Math.ceil(cost / 12)).toLocaleString()} per month.`;
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

  return `Your biggest expense is ${top.category} at NLe ${Number(top.total).toLocaleString()}. That's ${pct}% of your total spending. ${getCategoryAdvice(top.category, Number(top.total), pct)} Would you like me to suggest a realistic budget for this category?`;
}

function answerIncome(ctx) {
  if (!ctx.monthly_income && !ctx.total_received) {
    return "You haven't recorded any incoming transactions yet. As money comes in, I'll be able to give you personalized advice on managing your income.";
  }
  const totalIncome = ctx.monthly_income || ctx.total_received;
  const savingsRate = totalIncome > 0 ? ((ctx.total_saved / totalIncome) * 100).toFixed(0) : 0;
  return "Your monthly income is around NLe " + Number(totalIncome).toLocaleString() + ". Your total savings rate is " + savingsRate + "% of your income. " + (ctx.total_saved > 0 ? "Great job saving!" : "Consider starting a savings goal today to build a stronger financial future.");
}

function answerTrend(ctx) {
  if (!ctx.recent_transactions || ctx.recent_transactions.length === 0) {
    return "You don't have enough transaction history yet to show a trend. Keep using the app and I'll be able to analyze your spending patterns over time.";
  }
  return "Based on your recent transactions, your spending is NLe " + Number(ctx.total_spent).toLocaleString() + " total. Your wallet balance is NLe " + Number(ctx.wallet_balance).toLocaleString() + ". Would you like me to break this down by spending category or suggest a budget plan?";
}

function answerTips(ctx) {
  const tips = [];
  if (ctx.spending_breakdown && ctx.spending_breakdown.length > 0) {
    const top = ctx.spending_breakdown[0];
    const total = ctx.spending_breakdown.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const pct = total > 0 ? ((Number(top.total) / total) * 100).toFixed(0) : 0;
    if (pct > 30) {
      tips.push(`Try to reduce your ${top.category} spending by 15%. That alone could save you about NLe ${Math.round(Number(top.total) * 0.15).toLocaleString()} per month.`);
    }
  }
  tips.push("Set up automatic transfers to your savings goals right after payday.");
  tips.push("Review your subscriptions and recurring payments monthly.");
  if (tips.length === 0) {
    tips.push("Start tracking every expense by adding a purpose to your transactions.");
    tips.push("Set a realistic savings goal and automate deposits.");
  }
  return "Here are my top saving tips: " + tips.join(" ") + " Want me to build a personalized budget plan for you?";
}

function answerAnalysis(ctx) {
  const parts = [];
  parts.push(`Here's your financial overview. Your wallet balance is NLe ${Number(ctx.wallet_balance).toLocaleString()}.`);
  if (ctx.monthly_income > 0) {
    parts.push(`Your monthly income is NLe ${Number(ctx.monthly_income).toLocaleString()}.`);
  }
  if (ctx.total_spent > 0) {
    parts.push(`You've spent NLe ${Number(ctx.total_spent).toLocaleString()} total.`);
  }
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

function answerHealth(ctx) {
  const score = calculateHealthScore({
    totalSpent: ctx.total_spent,
    totalReceived: ctx.total_received,
    totalSaved: ctx.total_saved,
    transactionCount: ctx.deposit_count,
    goalsCount: ctx.goals ? ctx.goals.length : 0,
    goalsCompleted: ctx.goals ? ctx.goals.filter(g => Number(g.current_amount) >= Number(g.target_amount)).length : 0,
  });

  const balance = Number(ctx.wallet_balance || 0);
  const income = Number(ctx.monthly_income || ctx.total_received || 0);
  const expenses = Number(ctx.total_spent || 0);
  const savings = Number(ctx.total_saved || 0);

  let advice = "";
  if (score >= 80) advice = "Excellent! You're managing your finances well. Keep maintaining these healthy habits.";
  else if (score >= 60) advice = "Good progress! Focus on building your emergency fund and sticking to a budget.";
  else advice = "There's room for improvement. Start tracking expenses, create savings goals, and try to reduce unnecessary spending.";

  const breakdown = ` Here's why: your wallet balance is NLe ${balance.toLocaleString()}, you've saved NLe ${savings.toLocaleString()}, and your spending vs income ratio contributes to this score.`;

  return `Your financial health score is ${score}/100. ${advice}${breakdown}`;
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
    return "I'm here to help you manage your finances. Try asking me about your spending, savings goals, monthly budget, or how to save more money.";
  }
  return parts.join(' ') + " What would you like to focus on? You can ask me about your biggest expense, monthly spending, savings goals, or get personalized tips.";
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
  if (totalReceived > totalSpent) score += 5;
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
