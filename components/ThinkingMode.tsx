
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Brain, Loader2, ChevronRight, Terminal } from 'lucide-react';
import { GENERAL_SYSTEM_INSTRUCTION } from '../constants';

const ThinkingMode: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const handleThink = async () => {
    if (!prompt.trim()) return;
    if (!process.env.API_KEY) return;

    setIsThinking(true);
    setResponse('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Using gemini-3-pro-preview with max thinking budget
      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
            systemInstruction: GENERAL_SYSTEM_INSTRUCTION,
            thinkingConfig: { thinkingBudget: 32768 } // Max budget
        }
      });

      setResponse(result.text || "No output derived.");
    } catch (e: any) {
      setResponse(`Computation Error: ${e.message}`);
    } finally {
      setIsThinking(false);
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

      <div className="flex-1 p-6 overflow-y-auto z-10">
        <div className="max-w-3xl mx-auto w-full space-y-8">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-amber-500 flex items-center gap-2">
                    <Brain className="w-8 h-8" />
                    Deep Reasoning Engine
                </h2>
                <p className="text-zinc-400">Eburon v3 Pro • High Compute • Complex Analysis</p>
            </div>

            <div className="space-y-4">
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter complex scenario for deep analysis..."
                    className="w-full h-32 bg-zinc-900/50 border border-zinc-700 rounded-lg p-4 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all text-zinc-200 placeholder-zinc-600 backdrop-blur-sm"
                />
                <button 
                    onClick={handleThink}
                    disabled={isThinking}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                    {isThinking ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            REASONING...
                        </>
                    ) : (
                        <>
                            INITIATE SEQUENCE <ChevronRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>

            {response && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-6 relative overflow-hidden backdrop-blur-md shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-purple-600"></div>
                    <div className="flex items-center gap-2 mb-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">
                        <Terminal className="w-4 h-4" />
                        Output Stream
                    </div>
                    <div className="prose prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-300">{response}</pre>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ThinkingMode;
