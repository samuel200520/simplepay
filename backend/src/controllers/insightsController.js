/**
 * Insights Controller — Powered by Financial Intelligence Engine
 * 
 * Aggregates data from ALL connected wallets (SimplePay, banks, mobile money)
 * and provides intelligent financial analysis through the AI chat.
 */

const db = require('../db');
const financialEngine = require('../services/financialIntelligenceEngine');
const llmService = require('../services/llmService');

// ── Conversation History ──────────────────────────────────────────────

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
  try { await db.query(CONVERSATION_TABLE); } catch (err) {
    console.error('Conversation history table check failed:', err.message);
  }
}

async function getConversationHistory(userId, limit = 30) {
  await ensureConversationTable();
  const result = await db.query(
    'SELECT role, content FROM conversation_history WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2',
    [userId, limit]
  );
  return result.rows.map(r => ({ role: r.role, content: r.content }));
}

async function saveMessage(userId, role, content) {
  await ensureConversationTable();
  await db.query(
    'INSERT INTO conversation_history (user_id, role, content) VALUES ($1, $2, $3)',
    [userId, role, content]
  );
}

async function clearConversation(userId) {
  await ensureConversationTable();
  await db.query('DELETE FROM conversation_history WHERE user_id = $1', [userId]);
}

// ── GET /api/insights/insights — Full financial dashboard data ────────

exports.getInsights = async (req, res) => {
  const userId = req.user.userId;
  try {
    const overview = await financialEngine.getFinancialOverview(userId);

    // Get regular spending breakdown from transactions table (for existing UI compatibility)
    const spendingResult = await db.query(
      `SELECT COALESCE(tp.purpose, 'Other') as category, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN transaction_purposes tp ON tp.transaction_id = t.id AND tp.user_id = $1
       WHERE t.sender_user_id = $1 AND t.status = 'completed' AND (t.fee > 0 OR t.to_provider != 'simplepay')
       GROUP BY COALESCE(tp.purpose, 'Other') ORDER BY total DESC LIMIT 10`,
      [userId]
    );

    // Get monthly stats for trend analysis
    const monthlyResult = await db.query(
      `SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as total_spent, SUM(fee) as total_fees, COUNT(*) as transaction_count
       FROM transactions WHERE sender_user_id = $1 AND status = 'completed' AND (fee > 0 OR to_provider != 'simplepay')
       GROUP BY DATE_TRUNC('month', created_at) ORDER BY month DESC LIMIT 3`,
      [userId]
    );

    // Get goals
    const goalsResult = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      // Multi-wallet overview (NEW)
      total_balance: overview.totalBalance,
      wallet_breakdown: overview.walletBreakdown,
      wallet_count: overview.totalWallets,
      wallet_activity: overview.walletActivity,

      // Money analysis (NEW terminology: "received" not "income")
      total_received: overview.moneyReceived.totalReceived,
      received_transaction_count: overview.moneyReceived.transactionCount,
      average_received: overview.moneyReceived.averageReceived,
      received_sources: overview.moneyReceived.sources,

      // Spending analysis
      total_sent: overview.moneySent.totalSent,
      sent_transaction_count: overview.moneySent.transactionCount,
      average_sent: overview.moneySent.averageSent,
      spending_categories: overview.moneySent.categories,

      // Savings
      total_saved: overview.savings.totalSaved,
      savings_deposits: overview.savings.depositCount,
      savings_analysis: overview.savings,

      // Health
      health_score: overview.healthScore,
      health_label: overview.healthScore >= 80 ? 'Excellent' :
                     overview.healthScore >= 60 ? 'Good' :
                     overview.healthScore >= 40 ? 'Fair' : 'Needs Improvement',

      // Insights
      insights: overview.insights,

      // Legacy fields for backward compatibility with existing UI
      wallet_balance: overview.totalBalance,
      spending_breakdown: spendingResult.rows,
      monthly_stats: monthlyResult.rows,
      goals: goalsResult.rows,
      total_spent: overview.moneySent.totalSent,
    });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Could not fetch financial insights' });
  }
};

// ── GET /api/insights/overview — Multi-wallet overview endpoint ───────

exports.getMultiWalletOverview = async (req, res) => {
  const userId = req.user.userId;
  try {
    const overview = await financialEngine.getFinancialOverview(userId);
    res.json(overview);
  } catch (err) {
    console.error('Multi-wallet overview error:', err);
    res.status(500).json({ error: 'Could not fetch multi-wallet overview' });
  }
};

// ── POST /api/insights/chat — AI Chat with full context ──────────────

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
    // Build multi-wallet financial context using the engine
    const financialContext = await financialEngine.buildChatContext(userId);

    // Get conversation history for context memory
    const history = await getConversationHistory(userId, 20);
    const chatMessages = history.map(h => ({ role: h.role, content: h.content }));

    // Add the new user message
    chatMessages.push({ role: 'user', content: message.trim() });

    // Get AI response (uses LLM if configured, falls back to sophisticated rules)
    const response = await llmService.chatWithLLM(chatMessages, financialContext);

    // Save conversation
    await saveMessage(userId, 'user', message.trim());
    await saveMessage(userId, 'assistant', response);

    res.json({ response });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'I couldn\'t process your request. Please try asking differently.' });
  }
};

// ── GET /api/insights/budget — Budget recommendations ────────────────

exports.budgetRecommendations = async (req, res) => {
  const userId = req.user.userId;
  try {
    const overview = await financialEngine.getFinancialOverview(userId);

    const monthlyReceived = overview.moneyReceived.totalReceived || 0;
    const monthlySent = overview.moneySent.totalSent || 0;
    const totalSaved = overview.savings.totalSaved || 0;
    const totalBalance = overview.totalBalance || 0;

    const categories = {};
    (overview.moneySent.categories || []).forEach(c => {
      categories[c.category] = Number(c.total || 0);
    });

    const emergencyFund = monthlySent * 3;
    const emergencyFundProgress = totalSaved > 0
      ? Math.min(100, (totalSaved / Math.max(1, emergencyFund)) * 100) : 0;

    const recommendations = [];
    Object.keys(categories).forEach(cat => {
      const current = categories[cat];
      const percentage = monthlyReceived > 0 ? (current / monthlyReceived) * 100 : 0;
      let recommended = current;
      let suggestion = '';

      if (percentage > 40) {
        recommended = current * 0.7;
        suggestion = `Reduce by NLe ${Math.round(current - recommended).toLocaleString()} to bring this to a healthier level.`;
      } else if (percentage > 25) {
        recommended = current * 0.85;
        suggestion = `Consider reducing by NLe ${Math.round(current - recommended).toLocaleString()} for better balance.`;
      } else if (percentage < 10 && cat !== 'Investment') {
        recommended = current;
        suggestion = `You're doing well here. This category is well within budget.`;
      }

      recommendations.push({
        category: cat,
        current,
        recommended: Math.round(recommended),
        percentage: percentage.toFixed(0),
        suggestion,
      });
    });

    const recommendedMonthlySavings = monthlyReceived > 0 ? monthlyReceived * 0.2 : 0;
    const currentSavingsRate = monthlyReceived > 0
      ? Math.max(0, ((monthlyReceived - monthlySent) / monthlyReceived) * 100) : 0;

    res.json({
      monthly_income: monthlyReceived,
      monthly_expenses: monthlySent,
      current_balance: totalBalance,
      total_saved: totalSaved,
      recommended_monthly_savings: Math.round(recommendedMonthlySavings),
      current_savings_rate: currentSavingsRate.toFixed(0),
      emergency_fund_target: Math.round(emergencyFund),
      emergency_fund_progress: emergencyFundProgress.toFixed(0),
      recommendations,
      wallet_breakdown: overview.walletBreakdown,
    });
  } catch (err) {
    console.error('Budget recommendations error:', err);
    res.status(500).json({ error: 'Could not generate budget recommendations' });
  }
};

// ── Chat history management ───────────────────────────────────────────

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
