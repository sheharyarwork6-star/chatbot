import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, AlertCircle, Globe } from 'lucide-react';
import ChatMessage from './components/ChatMessage';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial greeting
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([
      {
        role: 'assistant',
        content: 'Hello! I\'m your local AI assistant with real-time internet access. Ask me anything — I can search the web for live information!',
      },
    ]);
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputMessage.trim() };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);
    setIsSearching(true);
    setError(null);

    // Placeholder for the assistant message while waiting
    const assistantPlaceholder = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      const backendBaseUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const response = await fetch(`${backendBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to connect to the AI server.');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantContent = data.answer || 'Sorry, I could not generate a response.';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: assistantContent,
        };
        return updated;
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not connect to the AI server. Make sure the backend is running.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d1117] text-slate-200">

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5 border-b border-gray-800 bg-[#161b22] sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="p-2 bg-blue-600/20 rounded-xl glow-effect text-blue-400">
            <Sparkles size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">Local Nexus AI</h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide hidden sm:block">OFFLINE LOCAL AGENT · REAL-TIME WEB SEARCH</p>
          </div>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-green-900/30 border border-green-800/50">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-400 animate-pulse"></span>
          <span className="text-xs text-green-400 font-medium">LIVE</span>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 scroll-smooth">
        <div className="max-w-4xl mx-auto flex flex-col pt-2 sm:pt-4 pb-24 sm:pb-32">

          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}

          {/* Searching the web indicator */}
          {isSearching && (
            <div className="flex w-full justify-start mb-3 sm:mb-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-indigo-900/30 border border-indigo-700/40 text-indigo-300 text-xs sm:text-sm">
                <Globe size={12} className="sm:w-4 sm:h-4 animate-spin" />
                <span>Searching the web for real-time data…</span>
              </div>
            </div>
          )}

          {/* Thinking/Loading Animation (before any token arrives) */}
          {isLoading && !isSearching && messages[messages.length - 1]?.content === '' && (
            <div className="flex w-full justify-start mb-4 sm:mb-6 animate-in fade-in duration-300">
              <div className="flex max-w-[90%] sm:max-w-[80%] flex-row gap-2 sm:gap-4 items-end">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full shadow-lg border border-gray-700 bg-gray-800 mr-2 sm:mr-4">
                  <Bot size={16} className="sm:w-5 sm:h-5 text-blue-400 animate-pulse" />
                </div>
                <div className="flex items-center px-3 sm:px-5 py-2.5 sm:py-4 rounded-2xl rounded-bl-sm bg-[#1f2937] border border-gray-700 shadow-md space-x-1 sm:space-x-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 typing-dot"></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 typing-dot"></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 typing-dot"></div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center justify-center mt-3 sm:mt-4 px-4">
              <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-900/40 text-red-400 rounded-lg text-xs sm:text-sm border border-red-800/50 max-w-[90%] sm:max-w-none">
                <AlertCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="w-full bg-gradient-to-t from-[#0d1117] via-[#0d1117]/95 to-transparent pt-4 sm:pt-6 pb-6 sm:pb-8 px-3 sm:px-4 md:px-8 absolute bottom-0">
        <div className="max-w-4xl mx-auto relative">
          <form
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 bg-[#1c2128] rounded-2xl p-2 border border-slate-700/60 shadow-xl focus-within:border-blue-500/50 focus-within:shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] transition-all duration-300"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-500 px-3 sm:px-4 py-2 sm:py-3 focus:outline-none text-sm sm:text-[15px]"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-2 sm:p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors duration-200 flex items-center justify-center shadow-lg min-w-[44px] min-h-[44px]"
            >
              <Send size={18} className="sm:w-5 sm:h-5" />
            </button>
          </form>
          <div className="text-center mt-2 sm:mt-3 text-xs text-slate-500">
            Powered by OpenAI · Real-Time DuckDuckGo Search
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
