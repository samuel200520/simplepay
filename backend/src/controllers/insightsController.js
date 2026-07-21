const db = require('../db');

exports.getInsights = async (req, res) => {
  const userId = req.user.userId;
  try {
    const userResult = await db.query('SELECT simplepay_account_number FROM users WHERE id = $1', [userId]);
    const simplepayNumber = userResult.rows[0]?.simplepay_account_number;

    const spendingResult = await db.query(
      `SELECT 
        COALESCE(purpose, 'Other') as category,
        SUM(amount) as total,
        COUNT(*) as count
       FROM transactions 
       WHERE sender_user_id = $1 AND fee > 0
       GROUP BY COALESCE(purpose, 'Other')
       ORDER BY total DESC LIMIT 10`,
      [userId]
    );

    const monthlyResult = await db.query(
      `SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(amount) as total_spent,
        SUM(fee) as total_fees,
        COUNT(*) as transaction_count
       FROM transactions 
       WHERE sender_user_id = $1 AND fee > 0
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC LIMIT 3`,
      [userId]
    );

    const savingsResult = await db.query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_saved,
        COUNT(*) as deposit_count
       FROM savings_transactions 
       WHERE user_id = $1 AND type = 'deposit'`,
      [userId]
    );

    const goalsResult = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );

    const totalTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume
       FROM transactions 
       WHERE sender_user_id = $1 AND fee > 0`,
      [userId]
    );

    const receivedTxns = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume
       FROM transactions 
       WHERE receiver_identifier = $1 AND sender_user_id != $1`,
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
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const userResult = await db.query('SELECT simplepay_account_number FROM users WHERE id = $1', [userId]);
    const simplepayNumber = userResult.rows[0]?.simplepay_account_number;

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('spend') || lowerMessage.includes('expense') || lowerMessage.includes('how much')) {
      const result = await db.query(
        `SELECT 
          COALESCE(purpose, 'Other') as category,
          SUM(amount) as total
         FROM transactions 
         WHERE sender_user_id = $1 AND fee > 0
         GROUP BY COALESCE(purpose, 'Other')
         ORDER BY total DESC`,
        [userId]
      );
      const total = result.rows.reduce((sum, r) => sum + Number(r.total), 0);
      const breakdown = result.rows.map(r => `${r.category}: NLe ${Number(r.total).toLocaleString()}`).join(', ');
      return res.json({
        response: `You've spent a total of NLe ${total.toLocaleString()} across ${result.rows.length} categories. ${breakdown}.`
      });
    }

    if (lowerMessage.includes('save') || lowerMessage.includes('saving')) {
      const result = await db.query(
        'SELECT COALESCE(SUM(amount), 0) as total_saved FROM savings_transactions WHERE user_id = $1 AND type = \'deposit\'',
        [userId]
      );
      const saved = Number(result.rows[0]?.total_saved || 0);
      return res.json({
        response: saved > 0 
          ? `You've saved NLe ${saved.toLocaleString()} so far across all your goals. Keep it up!`
          : 'You haven\'t started saving yet. Create a savings goal to begin building your future.'
      });
    }

    if (lowerMessage.includes('budget') || lowerMessage.includes('reduce') || lowerMessage.includes('advice')) {
      const topCategory = await db.query(
        `SELECT COALESCE(purpose, 'Other') as category, SUM(amount) as total
         FROM transactions 
         WHERE sender_user_id = $1 AND fee > 0
         GROUP BY COALESCE(purpose, 'Other')
         ORDER BY total DESC LIMIT 1`,
        [userId]
      );
      if (topCategory.rows.length > 0) {
        const top = topCategory.rows[0];
        const suggestion = Math.round(Number(top.total) * 0.15);
        return res.json({
          response: `Your biggest spending category is ${top.category} at NLe ${Number(top.total).toLocaleString()}. Reducing it by 15% could save you approximately NLe ${suggestion.toLocaleString()} per month.`
        });
      }
      return res.json({ response: 'Start tracking your expenses to receive personalized budgeting advice.' });
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('target')) {
      const goals = await db.query(
        'SELECT * FROM savings_goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
        [userId]
      );
      if (goals.rows.length === 0) {
        return res.json({ response: 'You don\'t have any savings goals yet. Create one to start tracking your progress.' });
      }
      const goalUpdates = goals.rows.map(g => {
        const progress = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
        const remaining = Number(g.target_amount) - Number(g.current_amount);
        return `${g.name}: ${progress}% complete (NLe ${remaining.toLocaleString()} remaining)`;
      }).join('. ');
      return res.json({ response: goalUpdates });
    }

    if (lowerMessage.includes('receive') || lowerMessage.includes('income') || lowerMessage.includes('deposit')) {
      const result = await db.query(
        `SELECT COUNT(*) as count, SUM(amount) as volume
         FROM transactions 
         WHERE receiver_identifier = $1 AND sender_user_id != $1`,
        [simplepayNumber]
      );
      const received = Number(result.rows[0]?.volume || 0);
      const count = Number(result.rows[0]?.count || 0);
      return res.json({
        response: `You've received NLe ${received.toLocaleString()} in ${count} transaction(s) to your SimplePay account.`
      });
    }

    const result = await db.query(
      `SELECT 
        COALESCE(purpose, 'Other') as category,
        SUM(amount) as total
       FROM transactions 
       WHERE sender_user_id = $1 AND fee > 0
       GROUP BY COALESCE(purpose, 'Other')
       ORDER BY total DESC LIMIT 3`,
      [userId]
    );

    if (result.rows.length > 0) {
      const top = result.rows[0];
      return res.json({
        response: `Based on your spending, your top category is ${top.category} at NLe ${Number(top.total).toLocaleString()}. Would you like tips on how to optimize your budget?`
      });
    }

    return res.json({ response: 'I\'m here to help you manage your finances better. Try asking about your spending, savings, or budget advice.' });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Could not process your request' });
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
