const db = require('../db');
const { chatWithLLM } = require('../services/llmService');

const CONVERSATION_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS conversation_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

async function ensureConversationTable() {
  try {
    await db.query(CONVERSATION_HISTORY_TABLE);
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
  await db.query(
    'INSERT INTO conversation_history (user_id, role, content) VALUES ($1, $2, $3)',
    [userId, role, content]
  );
}

async function clearConversation(userId) {
  await ensureConversationTable();
  await db.query('DELETE FROM conversation_history WHERE user_id = $1', [userId]);
}

function buildFinancialContext(userId) {
  return db.query(`
    WITH user_data AS (
      SELECT u.id, u.simplepay_account_number, u.created_at
      FROM users u WHERE u.id = $1
    ),
    wallet_balance AS (
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
      SELECT 
        COALESCE(purpose, 'Other') as category,
        SUM(amount) as total
      FROM transactions 
      WHERE sender_user_id = $1 AND fee > 0
      GROUP BY COALESCE(purpose, 'Other')
      ORDER BY total DESC LIMIT 5
    ),
    savings AS (
      SELECT COALESCE(SUM(amount), 0) as total_saved
      FROM savings_transactions 
      WHERE user_id = $1 AND type = 'deposit'
    ),
    goals AS (
      SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 10
    )
    SELECT 
      (SELECT balance FROM wallet_balance) as wallet_balance,
      (SELECT total FROM total_spent) as total_spent,
      (SELECT total FROM total_received) as total_received,
      (SELECT total_saved FROM savings) as total_saved,
      (SELECT array_agg(row_to_json(m) ORDER BY m.total DESC) FROM monthly_spending m) as spending_breakdown,
      (SELECT array_agg(row_to_json(g) ORDER BY g.created_at DESC) FROM goals g) as goals
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

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const context = await buildFinancialContext(userId);
    const financialContext = {
      wallet_balance: context.rows[0]?.wallet_balance || 0,
      total_spent: context.rows[0]?.total_spent || 0,
      total_received: context.rows[0]?.total_received || 0,
      total_saved: context.rows[0]?.total_saved || 0,
      spending_breakdown: context.rows[0]?.spending_breakdown || [],
      goals: context.rows[0]?.goals || [],
    };

    await saveMessage(userId, 'user', message);
    const history = await getConversationHistory(userId, 20);

    const llmMessages = history.map(h => ({
      role: h.role,
      content: h.content,
    }));

    const response = await chatWithLLM(llmMessages, financialContext);
    await saveMessage(userId, 'assistant', response);

    res.json({ response, history: [...history, { role: 'assistant', content: response }] });
  } catch (err) {
    console.error('Chat error:', err);
    if (err.message?.includes('API key')) {
      return res.status(500).json({ error: 'AI service is not configured. Please contact support.' });
    }
    res.status(500).json({ error: 'Could not process your request. Please try again.' });
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
        insights.push({
          type: 'warning',
          title: 'Monthly Analysis',
          message: `You spent ${change.toFixed(0)}% more this month compared to last month.`
        });
      } else if (change < -10) {
        insights.push({
          type: 'success',
          title: 'Monthly Analysis',
          message: `Great job! You spent ${Math.abs(change).toFixed(0)}% less this month.`
        });
      }
    }
  }

  if (spending.length > 0) {
    const top = spending[0];
    insights.push({
      type: 'insight',
      title: 'Top Spending Category',
      message: `${top.category} is your biggest expense at NLe ${Number(top.total).toLocaleString()}.`
    });
  }

  if (savings && Number(savings.total_saved) > 0) {
    insights.push({
      type: 'success',
      title: 'Savings',
      message: `You're saving consistently. Total saved: NLe ${Number(savings.total_saved).toLocaleString()}.`
    });
  }

  if (goals.length > 0) {
    goals.forEach(goal => {
      const progress = Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100);
      const remaining = Number(goal.target_amount) - Number(goal.current_amount);
      if (remaining > 0 && remaining < 500) {
        insights.push({
          type: 'goal',
          title: 'Goal Reminder',
          message: `Only NLe ${remaining.toLocaleString()} left to reach your ${goal.name} goal!`
        });
      }
    });
  }

  if (healthScore >= 80) {
    insights.push({
      type: 'success',
      title: 'Financial Health',
      message: `Excellent! Your financial health score is ${healthScore}/100.`
    });
  } else if (healthScore >= 60) {
    insights.push({
      type: 'insight',
      title: 'Financial Health',
      message: `Good progress! Your financial health score is ${healthScore}/100. Keep saving!`
    });
  }

  return insights;
}
