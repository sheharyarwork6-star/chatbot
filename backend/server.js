const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { default: ollama } = require('ollama');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Main model to use
const MODEL_NAME = 'llama3';

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

  // More selective: require at least 2 keywords or specific patterns
  const keywordCount = SEARCH_KEYWORDS.filter(keyword => lower.includes(keyword)).length;
  const hasQuestionWords = /\b(what|who|when|where|how|why|which)\b/i.test(lower);
  const hasTimeWords = /\b(today|now|current|latest|recent)\b/i.test(lower);

  // Only search if: 2+ keywords, or question word + time word, or very specific queries
  return keywordCount >= 2 || (hasQuestionWords && hasTimeWords) ||
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
        timeout: 3000, // Reduced from 6000ms to 3000ms for faster responses
      }
    );
    const $ = cheerio.load(data);
    const results = [];
    $('.result').each((i, el) => {
      if (i >= 3) return; // Reduced from 5 to 3 results for faster processing
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
// CHAT ENDPOINT — Streaming with SSE
// ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const lastUserMessage = messages[messages.length - 1].content;

    // Set up SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Fast keyword-based routing (0ms)
    const searchNeeded = needsWebSearch(lastUserMessage);
    console.log(`[Router] Search needed? ${searchNeeded ? 'YES (keyword match)' : 'NO'}`);

    // Build search context if needed
    let searchContext = '';
    if (searchNeeded) {
      console.log(`[Web Search] Fetching real-time data for: "${lastUserMessage}"`);
      // Send a "searching" status event to the frontend
      res.write(`data: ${JSON.stringify({ status: 'searching' })}\n\n`);

      const searchResults = await performSearch(lastUserMessage);
      if (searchResults) {
        searchContext = `\n\n[REAL-TIME INTERNET DATA]\n${searchResults}\n\nUse the above real-time data to accurately and concisely answer the user's question. Cite source URLs if relevant.`;
        console.log('[Web Search] Success — context injected.');
      } else {
        searchContext = '\n\n[REAL-TIME INTERNET DATA]\nCould not retrieve results. Answer based on your training knowledge.';
        console.log('[Web Search] Failed — falling back to model knowledge.');
      }
    }

    // System prompt
    const systemPrompt = {
      role: 'system',
      content: `You are a fast, helpful AI assistant. Give direct, concise answers. Use the real-time data when available. Keep responses under 200 words.${searchContext}`,
    };

    const finalMessages = [systemPrompt, ...messages];

    // Stream response from Ollama
    const stream = await ollama.chat({
      model: MODEL_NAME,
      messages: finalMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.message?.content || '';
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    // Signal end of stream
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('[Server Error]', error.message);

    // Send error via SSE if headers already sent, else JSON
    if (res.headersSent) {
      let errMsg = 'An error occurred with the local AI model.';
      if (error.message?.includes('not found')) {
        errMsg = `Model '${MODEL_NAME}' is not installed. Run: ollama pull ${MODEL_NAME}`;
      } else if (error.cause?.code === 'ECONNREFUSED') {
        errMsg = 'Ollama is not running. Please start the Ollama application.';
      }
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Server error. Make sure Ollama is running.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Local AI Agent running on port ${PORT}`);
  console.log(`   Model: ${MODEL_NAME}`);
  console.log(`   Mode:  Streaming + Real-Time Web Search\n`);
});
