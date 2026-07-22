/**
 * Smart Money Coach - Intelligent Financial Assistant
 * Advanced rule-based engine with conversation memory
 * Fully offline capable - no external dependencies
 */
async function chatWithLLM(messages, financialContext) {
  return generateIntelligentResponse(messages, financialContext);
}

/**
 * Main response generator - routes queries to specialized handlers
 */
function generateIntelligentResponse(messages, ctx) {
  try {
    if (!messages || messages.length === 0) {
      return buildWelcomeMessage(ctx);
    }

    const lastMsg = messages[messages.length - 1];
    const userMessage = (lastMsg.content || '').toLowerCase().trim();

    const context = extractConversationContext(messages);
    
    return routeQuery(userMessage, ctx, context);
  } catch (err) {
    console.error('LLM generation error:', err);
    return fallbackMessage();
  }
}

function extractConversationContext(messages) {
  const context = {
    previousTopic: null,
    mentionedAmount: null,
    mentionedCategory: null,
    mentionedGoal: null,
    isFollowUp: false
  };

  if (messages.length < 2) return context;

  // Look at last few messages to understand context
  const recentMessages = messages.slice(-4);
  const lastUserMsg = recentMessages.find(m => m.role === 'user');
  const lastAssistantMsg = recentMessages.find(m => m.role === 'assistant');

  if (lastUserMsg && lastAssistantMsg) {
    const userText = lastUserMsg.content.toLowerCase();
    const assistantText = lastAssistantMsg.content.toLowerCase();

    // Detect if user is referring to previous topic
    if (containsAny(userText, ['it', 'that', 'this', 'yes', 'no', 'okay', 'alright', 'sure'])) {
      context.isFollowUp = true;
    }

    // Extract mentioned category from assistant's previous response
    const categoryMatch = assistantText.match(/biggest expense is (\w+)/i) || 
                         assistantText.match(/spending (\w+) is/i) ||
                         assistantText.match(/on (\w+) across/i);
    if (categoryMatch) {
      context.mentionedCategory = categoryMatch[1];
    }

    // Extract mentioned goal
    const goalMatch = assistantText.match(/"([^"]+)" goal/i);
    if (goalMatch) {
      context.mentionedGoal = goalMatch[1];
    }

    // Extract amount from user's previous message
    const amountMatch = lastUserMsg.content.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
    if (amountMatch) {
      context.mentionedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Detect previous topic
    if (containsAny(assistantText, ['spending', 'expense', 'category'])) {
      context.previousTopic = 'spending';
    } else if (containsAny(assistantText, ['saving', 'goal', 'target'])) {
      context.previousTopic = 'savings';
    } else if (containsAny(assistantText, ['wallet', 'balance', 'account'])) {
      context.previousTopic = 'wallets';
    } else if (containsAny(assistantText, ['afford', 'purchase', 'buy'])) {
      context.previousTopic = 'affordability';
    }
  }

  return context;
}

function buildWelcomeMessage(ctx) {
  const total = Number(ctx.total_balance || 0);
  const walletCount = ctx.wallet_count || 0;

  if (walletCount > 1) {
    const walletList = (ctx.wallets || [])
      .map(w => `${w.name}: NLe ${Number(w.balance || 0).toLocaleString()}`)
      .join(', ');
    return `Hello! I'm your Smart Money Coach. You have NLe ${total.toLocaleString()} across ${walletCount} wallets (${walletList}). How can I help you today? Ask me about your spending, savings goals, or for financial advice.`;
  }

  return `Hello! I'm your Smart Money Coach. You have NLe ${total.toLocaleString()} in your wallet. Ask me about your spending, savings goals, or for budgeting tips!`;
}

function routeQuery(lower, ctx, conversationContext = {}) {
  // Conversation memory: check for follow-ups
  if (containsAny(lower, ['hello', 'hi', 'hey', 'greet', 'good morning', 'good evening'])) {
    return buildWelcomeMessage(ctx);
  }

  // Handle follow-up questions with context
  if (conversationContext.isFollowUp) {
    if (containsAny(lower, ['how much', 'how many', 'what', 'tell me', 'explain'])) {
      if (conversationContext.previousTopic === 'spending') {
        return answerSpending(lower, ctx);
      } else if (conversationContext.previousTopic === 'savings') {
        return answerSavings(ctx);
      } else if (conversationContext.previousTopic === 'wallets') {
        return answerWallets(ctx);
      }
    }
    
    // Handle "yes" or "sure" after advice
    if (containsAny(lower, ['yes', 'sure', 'okay', 'alright', 'please'])) {
      if (conversationContext.previousTopic === 'spending' && conversationContext.mentionedCategory) {
        return `Great! For your ${conversationContext.mentionedCategory} spending, I recommend tracking every expense in this category for the next 2 weeks. Set a monthly budget that's 15-20% lower than your current spending. Use cash or a separate wallet for this category to make tracking easier. Would you like me to help you set a specific budget amount?`;
      } else if (conversationContext.previousTopic === 'savings') {
        return `Excellent! Start by setting up an automatic savings goal. I suggest saving 20% of your money received each month. Even small amounts like NLe 50 per week will grow significantly over time. Would you like me to help you create your first savings goal?`;
      }
    }
  }

  if (containsAny(lower, ['how much', 'balance', 'available', 'total'])) {
    return answerBalance(ctx);
  }

  if (containsAny(lower, ['wallet', 'which wallet', 'compare', 'account'])) {
    return answerWallets(ctx);
  }

  if (containsAny(lower, ['spend', 'spent', 'spending', 'expense', 'where', 'going', 'biggest', 'largest', 'top'])) {
    return answerSpending(lower, ctx);
  }

  if (containsAny(lower, ['transaction', 'transactions', 'recent', 'history', 'activity'])) {
    return answerSpending(lower, ctx);
  }

  if (containsAny(lower, ['save', 'saving', 'saved', 'goal', 'target', 'progress'])) {
    return answerSavings(ctx);
  }

  if (containsAny(lower, ['receive', 'received', 'income', 'incoming', 'cash inflow', 'deposit'])) {
    return answerMoneyReceived(ctx);
  }

  if (containsAny(lower, ['sent', 'send', 'transfer', 'payment', 'outgoing'])) {
    return answerMoneySent(ctx);
  }

  if (containsAny(lower, ['afford', 'buy', 'purchase', 'laptop', 'phone', 'cost'])) {
    return answerAffordability(lower, ctx);
  }

  if (containsAny(lower, ['health', 'score', 'rating', 'rate'])) {
    return answerHealth(ctx);
  }

  if (containsAny(lower, ['advice', 'recommend', 'manage', 'budget', 'plan', 'tip', 'help'])) {
    return answerAdvice(ctx);
  }

  if (containsAny(lower, ['food', 'transport', 'rent', 'shopping', 'medical', 'business', 'family'])) {
    return answerCategory(lower, ctx);
  }

  if (containsAny(lower, ['analyze', 'analysis', 'overview', 'summary', 'report'])) {
    return answerOverview(ctx);
  }

  return fallbackMessage();
}

function answerBalance(ctx) {
  const total = Number(ctx.total_balance || 0);
  const wallets = ctx.wallets || [];
  const walletCount = ctx.wallet_count || 0;

  if (walletCount === 0) {
    return `You don't have any connected wallets yet. Link a bank account or mobile money wallet to see your complete financial picture here.`;
  }

  if (walletCount === 1) {
    return `Your current balance is NLe ${total.toLocaleString()} in your ${wallets[0]?.name || 'wallet'}. Would you like tips on how to manage this more effectively?`;
  }

  const breakdown = wallets
    .map(w => `${w.name}: NLe ${Number(w.balance || 0).toLocaleString()}`)
    .join(', ');

  const richest = wallets.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))[0];

  return `Your total available funds across ${walletCount} wallets is NLe ${total.toLocaleString()}. Here's the breakdown: ${breakdown}. Your ${richest.name} holds the largest share. Would you like me to analyze your spending patterns or suggest ways to grow your savings?`;
}

function answerWallets(ctx) {
  const wallets = ctx.wallets || [];
  const walletCount = ctx.wallet_count || 0;

  if (walletCount === 0) {
    return `You haven't linked any external wallets yet. Connect your bank accounts and mobile money wallets so I can give you a complete financial picture.`;
  }

  const mostActive = ctx.most_active_wallet;
  const activityInfo = mostActive
    ? `Your most active wallet is ${mostActive.name} with ${mostActive.transactions} transactions.`
    : '';

  const walletBreakdown = wallets
    .map(w => {
      const activity = (ctx.all_wallet_activity || []).find(a => a.name === w.name);
      const txns = activity ? ` (${activity.sentCount + activity.receivedCount} transactions)` : '';
      return `${w.name} (${w.provider}): NLe ${Number(w.balance || 0).toLocaleString()}${txns}`;
    })
    .join('. ');

  return `You have ${walletCount} connected wallets. ${walletBreakdown}. ${activityInfo} Would you like me to compare them or suggest where to keep your money?`;
}

function answerSpending(lower, ctx) {
  const totalSent = Number(ctx.total_sent || 0);
  const categories = ctx.spending_categories || [];
  const txCount = ctx.sent_transaction_count || 0;

  if (txCount === 0) {
    return `You haven't made any outgoing transactions yet. Once you start sending money, I'll be able to analyze your spending patterns and help you make smarter financial decisions.`;
  }

  if (categories.length === 0) {
    return `You've sent a total of NLe ${totalSent.toLocaleString()} across ${txCount} transactions. Add purposes to your transactions so I can break down your spending by category.`;
  }

  const topCat = categories[0];
  const pct = totalSent > 0 ? Math.round((Number(topCat.total || 0) / totalSent) * 100) : 0;

  if (containsAny(lower, ['biggest', 'largest', 'top', 'main'])) {
    let advice = '';
    if (pct > 40) advice = ` This is quite high — reducing it by even 15% could save you about NLe ${Math.round(Number(topCat.total || 0) * 0.15).toLocaleString()}.`;
    else if (pct > 25) advice = ' This is a significant portion of your spending. Small reductions can add up quickly.';
    return `Your biggest expense is ${topCat.category} at NLe ${Number(topCat.total || 0).toLocaleString()}, which is ${pct}% of your total spending.${advice} Would you like me to help you create a budget for this category?`;
  }

  if (containsAny(lower, ['where', 'going', 'breakdown', 'category'])) {
    const catBreakdown = categories.slice(0, 5)
      .map(c => `${c.category}: NLe ${Number(c.total || 0).toLocaleString()} (${totalSent > 0 ? Math.round((Number(c.total || 0) / totalSent) * 100) : 0}%)`)
      .join('. ');
    return `Here's where your money is going: ${catBreakdown}. Your top category is ${topCat.category} at ${pct}% of spending. Would you like tips on reducing any of these?`;
  }

  return `You've sent NLe ${totalSent.toLocaleString()} across ${txCount} transactions. Your biggest spending category is ${topCat.category} at NLe ${Number(topCat.total || 0).toLocaleString()} (${pct}% of total). Would you like a full spending breakdown or tips on saving?`;
}

function answerCategory(lower, ctx) {
  const categories = ctx.spending_categories || [];
  const totalSent = Number(ctx.total_sent || 0);

  const matchedCat = categories.find(c => {
    const catName = (c.category || '').toLowerCase();
    return containsAny(lower, [catName]) || catName.split(' ').some(word => lower.includes(word));
  });

  if (!matchedCat) {
    return `I couldn't find spending data for that specific category. Your tracked categories are: ${categories.map(c => c.category).join(', ') || 'none yet'}. Try asking about one of these, or add purposes to your transactions for better tracking.`;
  }

  const pct = totalSent > 0 ? Math.round((Number(matchedCat.total || 0) / totalSent) * 100) : 0;
  const catAdvice = getCategoryAdvice(matchedCat.category, pct);

  return `You've spent NLe ${Number(matchedCat.total || 0).toLocaleString()} on ${matchedCat.category} across ${matchedCat.count || 0} transactions, which is ${pct}% of your total spending. ${catAdvice}`;
}

function getCategoryAdvice(category, pct) {
  const adviceMap = {
    'Food': pct > 30 ? 'This is quite high. Consider meal planning and cooking at home to reduce food expenses.' : 'Your food spending is reasonable. Keep tracking to stay within budget.',
    'Transport': pct > 20 ? 'Transport costs are adding up. Consider carpooling or planning trips more efficiently.' : 'Your transport expenses are manageable.',
    'Rent': 'Housing is typically the biggest fixed expense. Make sure it fits within 30% of your monthly incoming funds.',
    'Shopping': 'Try the 24-hour rule before purchases — wait a day to decide if you really need it.',
    'Business': 'Business expenses should generate returns. Track your ROI carefully on these investments.',
    'Medical': 'Health expenses can be unpredictable. Consider setting up an emergency fund for medical costs.',
    'Family Support': 'Supporting family is generous. Set a monthly limit to protect your own financial goals.',
    'Utilities': 'Utilities are essential. Look for energy-efficient options to reduce monthly costs.',
    'Entertainment': 'Entertainment spending is fine in moderation. Consider setting a monthly entertainment budget.',
  };
  return adviceMap[category] || `Track this category to identify potential savings. Even small reductions here can add up over time.`;
}

function answerSavings(ctx) {
  const totalSaved = Number(ctx.total_saved || 0);
  const goals = ctx.goals || [];
  const goalsCount = ctx.goals_count || 0;

  if (totalSaved === 0 && goalsCount === 0) {
    return `You haven't started saving yet, and you don't have any savings goals. Creating a goal is the first step! Start small — even NLe 50 per week adds up to NLe 2,600 per year. Would you like me to help you set up your first savings goal?`;
  }

  if (goalsCount > 0) {
    const goalDetails = goals
      .map(g => `${g.name}: ${g.progress}% complete (NLe ${Number(g.remaining || 0).toLocaleString()} remaining)`)
      .join('. ');

    const nearComplete = goals.find(g => g.progress >= 75 && g.progress < 100);
    const encouragement = nearComplete
      ? ` Great news — your "${nearComplete.name}" goal is almost complete! Just NLe ${Number(nearComplete.remaining || 0).toLocaleString()} to go.`
      : '';

    return `You have ${goalsCount} savings goals. ${goalDetails}.${encouragement} Your total saved across all goals is NLe ${totalSaved.toLocaleString()}. Would you like tips on reaching your goals faster?`;
  }

  return `You've saved NLe ${totalSaved.toLocaleString()} so far. Consider creating a savings goal to give your savings a clear purpose. Would you like help setting one up?`;
}

function answerMoneyReceived(ctx) {
  const totalReceived = Number(ctx.total_received || 0);
  const txCount = ctx.received_transaction_count || 0;
  const avg = Number(ctx.average_received || 0);

  if (txCount === 0) {
    return `You haven't received any money through your connected wallets yet. When you do, I'll track your incoming funds and help you manage them wisely.`;
  }

  const sources = (ctx.received_sources || [])
    .map(s => `${s.source}: NLe ${Number(s.total || 0).toLocaleString()} (${s.count} transactions)`)
    .join('. ');

  return `You've received NLe ${totalReceived.toLocaleString()} through ${txCount} transactions, averaging NLe ${avg.toLocaleString()} per transaction. ${sources ? 'Sources: ' + sources : ''} Consider setting aside a portion of your incoming funds toward your savings goals.`;
}

function answerMoneySent(ctx) {
  const totalSent = Number(ctx.total_sent || 0);
  const txCount = ctx.sent_transaction_count || 0;
  const avg = Number(ctx.average_sent || 0);

  if (txCount === 0) {
    return `You haven't sent any money through your connected wallets yet. When you do, I'll analyze your outgoing transactions and help you spot patterns.`;
  }

  return `You've sent NLe ${totalSent.toLocaleString()} across ${txCount} transactions, averaging NLe ${avg.toLocaleString()} per transaction. Would you like me to break this down by category or suggest ways to optimize your spending?`;
}

function answerAffordability(lower, ctx) {
  const totalBalance = Number(ctx.total_balance || 0);
  const totalSaved = Number(ctx.total_saved || 0);
  const totalSent = Number(ctx.total_sent || 0);
  const totalReceived = Number(ctx.total_received || 0);

  const amount = extractAmount(lower);
  const available = totalBalance + totalSaved;

  if (amount) {
    if (available >= amount) {
      const remainingAfter = available - amount;
      const goalsAtRisk = (ctx.goals || []).filter(g => {
        const rem = Number(g.remaining || 0);
        return rem > 0 && remainingAfter < rem;
      });

      let goalWarning = '';
      if (goalsAtRisk.length > 0) {
        goalWarning = ` However, this will impact your savings goals — ${goalsAtRisk.map(g => `"${g.name}" would drop to ${Math.max(0, Number(g.current || 0) - Math.max(0, amount - totalBalance))}%`).join(' and ')}.`;
      }

      return `You can afford this purchase. You have NLe ${available.toLocaleString()} available (NLe ${totalBalance.toLocaleString()} in wallets + NLe ${totalSaved.toLocaleString()} in savings).${goalWarning} Consider if this is the right time for this expense.`;
    }

    const shortfall = amount - available;
    const monthlySurplus = totalReceived - totalSent;
    const monthsToSave = monthlySurplus > 0 ? Math.ceil(shortfall / monthlySurplus) : null;

    let plan = '';
    if (monthsToSave) {
      plan = ` At your current rate of saving about NLe ${monthlySurplus.toLocaleString()} per month, you could afford this in approximately ${monthsToSave} months.`;
    } else {
      plan = ` You'd need to reduce spending or increase incoming funds to make this purchase comfortably.`;
    }

    return `That costs NLe ${amount.toLocaleString()}, but you currently have NLe ${available.toLocaleString()} available. You're short by NLe ${shortfall.toLocaleString()}.${plan} Would you like me to help you create a savings goal for this?`;
  }

  return `Based on your total available funds of NLe ${available.toLocaleString()}, I can help you figure out if a purchase makes sense. How much does it cost?`;
}

function answerHealth(ctx) {
  const score = ctx.health_score || 0;
  const label = ctx.health_label || 'N/A';
  const totalBalance = Number(ctx.total_balance || 0);
  const totalSaved = Number(ctx.total_saved || 0);
  const totalSent = Number(ctx.total_sent || 0);
  const totalReceived = Number(ctx.total_received || 0);

  const details = [];
  if (totalBalance > 0) details.push(`total funds of NLe ${totalBalance.toLocaleString()}`);
  if (totalSaved > 0) details.push(`NLe ${totalSaved.toLocaleString()} saved`);
  if (totalReceived > totalSent) details.push('positive cash flow');
  if (totalSent > totalReceived) details.push('spending more than receiving');

  const contextStr = details.length > 0 ? ` This is based on your ${details.join(', ')}.` : '';

  if (score >= 80) {
    return `Your financial health score is ${score}/100 — Excellent! 🎉${contextStr} You're managing your money well across all wallets. Keep maintaining these healthy habits and your financial future looks bright.`;
  } else if (score >= 60) {
    return `Your financial health score is ${score}/100 — Good.${contextStr} You're on the right track. Focus on building your savings and reducing unnecessary expenses to push this higher.`;
  } else if (score >= 40) {
    return `Your financial health score is ${score}/100 — Fair.${contextStr} There's room for improvement. Start by tracking your expenses more closely and setting up at least one savings goal.`;
  }
  return `Your financial health score is ${score}/100 — Needs Improvement.${contextStr} Focus on reducing spending, building savings, and creating financial goals. I can help you make a plan.`;
}

function answerAdvice(ctx) {
  const totalBalance = Number(ctx.total_balance || 0);
  const totalSent = Number(ctx.total_sent || 0);
  const totalReceived = Number(ctx.total_received || 0);
  const totalSaved = Number(ctx.total_saved || 0);
  const categories = ctx.spending_categories || [];

  const tips = [];

  if (totalReceived > totalSent && totalSent > 0) {
    const surplus = totalReceived - totalSent;
    tips.push(`You have a monthly surplus of about NLe ${surplus.toLocaleString()}. Consider automatically saving 20% of this amount.`);
  }

  if (categories.length > 0) {
    const topCat = categories[0];
    const pct = totalSent > 0 ? Math.round((Number(topCat.total || 0) / totalSent) * 100) : 0;
    if (pct > 30) {
      tips.push(`Your ${topCat.category} spending (${pct}% of total) is high. Reducing it by just 15% could save about NLe ${Math.round(Number(topCat.total || 0) * 0.15).toLocaleString()}.`);
    }
  }

  if (totalSaved === 0) {
    tips.push(`Start saving immediately — even NLe 20 per day builds to NLe 7,300 per year. Set up a savings goal to get started.`);
  } else if (totalSent > 0 && totalSaved < totalSent * 0.1) {
    tips.push(`Your savings rate is low. Aim to save at least 10% of what you spend.`);
  }

  tips.push(`Review your transactions weekly to spot patterns and unnecessary expenses.`);
  tips.push(`Keep an emergency fund of at least 3 months of expenses in a separate savings goal.`);

  if (tips.length === 0) {
    return `I recommend tracking all your expenses, setting a monthly budget, and automating your savings. Would you like me to help with any of these?`;
  }

  return tips.join(' ') + ' Would you like me to elaborate on any of these?';
}

function answerOverview(ctx) {
  const totalBalance = Number(ctx.total_balance || 0);
  const totalSent = Number(ctx.total_sent || 0);
  const totalReceived = Number(ctx.total_received || 0);
  const totalSaved = Number(ctx.total_saved || 0);
  const walletCount = ctx.wallet_count || 0;
  const goalsCount = ctx.goals_count || 0;

  const parts = [
    `Here's your complete financial overview.`,
    `You have NLe ${totalBalance.toLocaleString()} across ${walletCount} wallet${walletCount !== 1 ? 's' : ''}.`,
  ];

  if (totalReceived > 0) parts.push(`You've received NLe ${totalReceived.toLocaleString()} in total.`);
  if (totalSent > 0) parts.push(`You've sent NLe ${totalSent.toLocaleString()} in total.`);
  if (totalSaved > 0) parts.push(`You've saved NLe ${totalSaved.toLocaleString()}.`);
  if (goalsCount > 0) parts.push(`You have ${goalsCount} active savings goal${goalsCount !== 1 ? 's' : ''}.`);

  parts.push(`What would you like to focus on — spending, saving, or budgeting?`);

  return parts.join(' ');
}

function fallbackMessage() {
  return `I can help you understand your spending, wallets, savings, and money habits. Try asking me about your balance, spending, savings goals, or for budgeting advice. For example: "How much money do I have?", "Where is my money going?", or "Help me save more."`;
}

function containsAny(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}

function extractAmount(text) {
  const match = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

module.exports = { chatWithLLM };
