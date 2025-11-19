
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Loader2, Globe, Sparkles, MapPin, Trash2, Cloud } from 'lucide-react';
import { Message, GroundingSource } from '../types';
import { GENERAL_SYSTEM_INSTRUCTION } from '../constants';
import { supabase, getSessionId } from '../utils/supabaseClient';

const ChatInterface: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [useSearch, setUseSearch] = useState(true);
  const [useMaps, setUseMaps] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history from Supabase on mount
  useEffect(() => {
    const fetchHistory = async () => {
      const sessionId = getSessionId();
      try {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('session_id', sessionId)
          .order('timestamp', { ascending: true });

        if (data && !error) {
          const loadedMessages: Message[] = data.map((row: any) => ({
            role: row.role,
            text: row.text,
            timestamp: row.timestamp,
            sources: row.sources
          }));
          setMessages(loadedMessages);
        } else {
             // Fallback to localstorage if DB empty or error
            const saved = localStorage.getItem('eburon_chat_history');
            if (saved) setMessages(JSON.parse(saved));
        }
      } catch (e) {
        console.warn("Failed to fetch chat history from DB", e);
        const saved = localStorage.getItem('eburon_chat_history');
        if (saved) setMessages(JSON.parse(saved));
      } finally {
        setIsHistoryLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const saveMessageToDb = async (msg: Message) => {
      const sessionId = getSessionId();
      try {
          await supabase.from('chat_history').insert({
              session_id: sessionId,
              role: msg.role,
              text: msg.text,
              timestamp: msg.timestamp,
              sources: msg.sources,
              created_at: new Date().toISOString()
          });
      } catch (e) {
          console.warn("Failed to save message to DB", e);
      }
      
      // Always save to local as backup
      localStorage.setItem('eburon_chat_history', JSON.stringify([...messages, msg]));
  };

  const clearHistory = async () => {
    const sessionId = getSessionId();
    setMessages([]);
    localStorage.removeItem('eburon_chat_history');
    try {
        await supabase.from('chat_history').delete().eq('session_id', sessionId);
    } catch(e) {
        console.warn("Failed to clear DB history", e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!process.env.API_KEY) {
        alert("API Key missing");
        return;
    }

    const userMsg: Message = { role: 'user', text: input, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Fire and forget save
    saveMessageToDb(userMsg);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const tools: any[] = [];
      if (useSearch) tools.push({ googleSearch: {} });
      if (useMaps) {
         tools.push({ googleMaps: {} });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userMsg.text,
        config: {
            systemInstruction: GENERAL_SYSTEM_INSTRUCTION,
            tools: tools.length > 0 ? tools : undefined,
        }
      });

      const text = response.text || "No response generated.";
      let sources: GroundingSource[] = [];
      
      // Extract grounding
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
          chunks.forEach((chunk: any) => {
              if (chunk.web?.uri) {
                  sources.push({ uri: chunk.web.uri, title: chunk.web.title || 'Web Source' });
              }
          });
      }

      const modelMsg: Message = {
          role: 'model',
          text,
          timestamp: Date.now(),
          sources: sources.length > 0 ? sources : undefined
      };

      setMessages(prev => [...prev, modelMsg]);
      saveMessageToDb(modelMsg);

    } catch (e: any) {
      const errorMsg: Message = {
          role: 'system',
          text: `Error: ${e.message}`,
          timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      saveMessageToDb(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-zinc-900 to-black text-white relative overflow-hidden">
       {/* Background grid effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
           style={{ 
               backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
           }}>
      </div>

      <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md flex justify-between items-center z-10">
          <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Intelligence Relay
          </h2>
          <div className="flex gap-2">
              {messages.length > 0 && (
                <button 
                    onClick={clearHistory}
                    className="p-2 rounded-md bg-zinc-800/80 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors mr-2"
                    title="Clear History"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => setUseSearch(!useSearch)}
                className={`p-2 rounded-md transition-colors ${useSearch ? 'bg-blue-900/50 text-blue-400 border border-blue-800' : 'bg-zinc-800/80 text-zinc-500'}`}
                title="Google Search"
              >
                  <Globe className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setUseMaps(!useMaps)}
                className={`p-2 rounded-md transition-colors ${useMaps ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-zinc-800/80 text-zinc-500'}`}
                title="Google Maps"
              >
                  <MapPin className="w-4 h-4" />
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10" ref={scrollRef}>
        {isHistoryLoading && (
             <div className="flex justify-center py-10">
                 <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
             </div>
        )}
        {!isHistoryLoading && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-50">
                <Sparkles className="w-12 h-12 mb-4" />
                <p>EBURON ready. Toggle Search/Maps for grounded data.</p>
            </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-lg ${
                msg.role === 'user' 
                ? 'bg-amber-600 text-white rounded-br-none' 
                : msg.role === 'system' ? 'bg-red-900/20 text-red-400 border border-red-900/30'
                : 'bg-zinc-800/80 text-zinc-200 rounded-bl-none border border-zinc-700/50 backdrop-blur-sm'
            }`}>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
              
              {msg.sources && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                      <span className="text-xs font-mono text-zinc-400 w-full">SOURCES</span>
                      {msg.sources.map((s, i) => (
                          <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" 
                             className="text-xs bg-black/30 hover:bg-black/50 px-2 py-1 rounded text-blue-300 truncate max-w-[150px]">
                              {s.title}
                          </a>
                      ))}
                  </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-zinc-800/80 rounded-2xl p-4 rounded-bl-none flex gap-2 items-center border border-zinc-700/50">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                    <span className="text-xs text-zinc-400 animate-pulse">Processing...</span>
                </div>
            </div>
        )}
      </div>

      <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800/50 z-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Query Eburon Intelligence..."
            className="flex-1 bg-black/50 border border-zinc-700/50 rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500 text-sm text-white placeholder-zinc-500"
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-zinc-100 text-zinc-900 rounded-lg px-4 py-2 hover:bg-white disabled:opacity-50 font-medium transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
