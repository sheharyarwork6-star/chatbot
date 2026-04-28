const axios = require('axios');
const cheerio = require('cheerio');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const SEARCH_TIMEOUT_MS = 2000;

const SEARCH_KEYWORDS = [
  'today', 'right now', 'current', 'currently', 'latest', 'recent', 'recently',
  'news', 'breaking', 'live', 'now', 'update', 'updates',
  'weather', 'temperature', 'forecast',
  'who won', 'score', 'match', 'result', 'results', 'standings',
  'price', 'stock', 'rate', 'exchange rate',
  'what is happening', 'what happened', 'trending',
  'released', 'announced', 'launch', 'launched',
  'war', 'election', 'president', 'prime minister',
  '2024', '2025', '2026',
];

function needsWebSearch(message) {
  const lower = message.toLowerCase();
  const keywordCount = SEARCH_KEYWORDS.filter(keyword => lower.includes(keyword)).length;
  const hasQuestionWords = /\b(what|who|when|where|how|why|which)\b/i.test(lower);
  const hasTimeWords = /\b(today|now|current|latest|recent)\b/i.test(lower);
  return keywordCount >= 3 || (hasQuestionWords && hasTimeWords) ||
         lower.includes('what is the') || lower.includes('who is') ||
         lower.includes('how much') || lower.includes('what are');
}

const searchCache = new Map();

async function performSearch(query) {
  const cacheKey = query.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < 300000) {
    return cached.results;
  }

  try {
    const { data } = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: SEARCH_TIMEOUT_MS,
      }
    );
    const $ = cheerio.load(data);
    const results = [];
    $('.result').each((i, el) => {
      if (i >= 2) return;
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const url = $(el).find('.result__url').text().trim();
      if (title && snippet) {
        results.push(`Source: ${url}\nTitle: ${title}\nInfo: ${snippet}`);
      }
    });
    const finalResults = results.length > 0 ? results.join('\n\n') : null;
    if (finalResults) {
      searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    }
    return finalResults;
  } catch (error) {
    console.error('[Web Search] Failed:', error.message);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const lastUserMessage = messages[messages.length - 1]?.content || '';
  const searchNeeded = needsWebSearch(lastUserMessage);

  let searchContext = '';
  if (searchNeeded) {
    const searchResults = await performSearch(lastUserMessage);
    if (searchResults) {
      searchContext = `\n\n[REAL-TIME INTERNET DATA]\n${searchResults}\n\nUse the above real-time data to accurately and concisely answer the user's question. Cite source URLs if relevant.`;
    } else {
      searchContext = '\n\n[REAL-TIME INTERNET DATA]\nCould not retrieve results. Answer based on your training knowledge.';
    }
  }

  const systemPrompt = {
    role: 'system',
    content: `You are a fast, helpful AI assistant. Give direct, concise answers. Use the real-time data when available. Keep responses under 200 words.${searchContext}`,
  };

  const finalMessages = [systemPrompt, ...messages];

  try {
    const completion = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: OPENAI_MODEL,
        messages: finalMessages,
        max_tokens: 512,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const assistantMessage = completion.data?.choices?.[0]?.message?.content?.trim() ||
      'I could not generate an answer right now.';

    return res.status(200).json({ answer: assistantMessage });
  } catch (error) {
    console.error('[OpenAI Error]', error.response?.data || error.message);
    return res.status(500).json({ error: 'OpenAI request failed.' });
  }
};
