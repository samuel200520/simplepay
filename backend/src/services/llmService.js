const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function chatWithLLM(messages, financialContext) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are SimplePay's Smart Money Coach, a friendly and professional AI financial advisor for users in Sierra Leone.

Your personality:
- Friendly and supportive
- Professional but approachable
- Intelligent and insightful
- Never respond with just numbers - always explain and provide context
- Give actionable advice
- Be encouraging but honest

Financial context for this user:
${JSON.stringify(financialContext, null, 2)}

Guidelines:
- Use NLe (Sierra Leonean Leone) for all currency references
- Provide specific, personalized advice based on their actual spending data
- If they ask about goals, reference their actual goals and progress
- If they ask about spending, break it down by category with percentages
- Always be helpful and never judgmental
- If you don't have enough information, ask clarifying questions
- Keep responses concise but thorough (2-4 sentences usually)
- Use emojis sparingly to be friendly 🎓💰📈`;

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response. Please try again.';
}

module.exports = { chatWithLLM };
