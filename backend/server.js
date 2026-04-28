require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Main model to use via OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const SEARCH_TIMEOUT_MS = 2000;

// ─────────────────────────────────────────────────────────────
// FAST KEYWORD ROUTER — Zero AI call, instant decision (0ms)
// ─────────────────────────────────────────────────────────────
const SEARCH_KEYWORDS = [
  'today', 'right now', 'current', 'currently', 'latest', 'recent', 'recently',
  'news', 'breaking', 'live', 'now', 'update', 'updates',
  'weather', 'temperature', 'forecast',
  'who won', 'score', 'match', 'result', 'results', 'standings',
  'price', 'stock', 'rate', 'exchange rate',
  'what is happening', 'what happened', 'trending',
  'released', 'announced', 'launch', 'launched',
  'war', 'election', 'president', 'prime minister',
  '2024', '2025', '2026', // More specific year references
];

function needsWebSearch(message) {
  const lower = message.toLowerCase();

  // More selective: require at least 3 keywords or specific patterns
  const keywordCount = SEARCH_KEYWORDS.filter(keyword => lower.includes(keyword)).length;
  const hasQuestionWords = /\b(what|who|when|where|how|why|which)\b/i.test(lower);
  const hasTimeWords = /\b(today|now|current|latest|recent)\b/i.test(lower);

  // Only search if: 2+ keywords, or question word + time word, or very specific queries
  return keywordCount >= 3 || (hasQuestionWords && hasTimeWords) ||
         lower.includes('what is the') || lower.includes('who is') ||
         lower.includes('how much') || lower.includes('what are');
}

// ─────────────────────────────────────────────────────────────
// WEB SCRAPING — DuckDuckGo HTML (acts like a real browser search)
// ─────────────────────────────────────────────────────────────
// Simple in-memory cache for search results (5 minute TTL)
const searchCache = new Map();

async function performSearch(query) {
  const cacheKey = query.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes
    console.log('[Web Search] Using cached results');
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
      if (i >= 2) return; // Keep only the top two results for faster parsing
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const url = $(el).find('.result__url').text().trim();
      if (title && snippet) {
        results.push(`Source: ${url}\nTitle: ${title}\nInfo: ${snippet}`);
      }
    });
    const finalResults = results.length > 0 ? results.join('\n\n') : null;

    // Cache the results
    if (finalResults) {
      searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    }

    return finalResults;
  } catch (error) {
    console.error('[Web Search] Failed:', error.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// CHAT ENDPOINT
// ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const lastUserMessage = messages[messages.length - 1].content;

    // Fast keyword-based routing (0ms)
    const searchNeeded = needsWebSearch(lastUserMessage);
    console.log(`[Router] Search needed? ${searchNeeded ? 'YES (keyword match)' : 'NO'}`);

    // Build search context if needed
    let searchContext = '';
    if (searchNeeded) {
      console.log(`[Web Search] Fetching real-time data for: "${lastUserMessage}"`);
      const searchResults = await performSearch(lastUserMessage);
      if (searchResults) {
        searchContext = `\n\n[REAL-TIME INTERNET DATA]\n${searchResults}\n\nUse the above real-time data to accurately and concisely answer the user's question. Cite source URLs if relevant.`;
        console.log('[Web Search] Success — context injected.');
      } else {
        searchContext = '\n\n[REAL-TIME INTERNET DATA]\nCould not retrieve results. Answer based on your training knowledge.';
        console.log('[Web Search] Failed — falling back to model knowledge.');
      }
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' });
    }

    const systemPrompt = {
      role: 'system',
      content: `You are a fast, helpful AI assistant. Give direct, concise answers. Use the real-time data when available. Keep responses under 200 words.${searchContext}`,
    };

    const finalMessages = [systemPrompt, ...messages];

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

    res.json({ answer: assistantMessage });

  } catch (error) {
    console.error('[Server Error]', error.message);
    res.status(500).json({ error: 'Server error. Please check your OpenAI configuration.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Local AI Agent running on port ${PORT}`);
  console.log(`   Model: ${OPENAI_MODEL}`);
  console.log(`   Mode: OpenAI-backed API + Real-Time Web Search\n`);
});
