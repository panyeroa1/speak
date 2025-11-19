import React, { useEffect, useRef, useState } from 'react';
import { useLiveApi } from '../hooks/useLiveApi';
import AudioVisualizer from './AudioVisualizer';
import { Mic, PhoneOff, Radio, Loader2, RefreshCw, Settings2, HelpCircle } from 'lucide-react';

const LiveAgent: React.FC = () => {
  const { connect, disconnect, sendText, status, transcription } = useLiveApi();
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFinishedRef = useRef(false);
  const isConcludingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const lastUserActivityRef = useRef<number>(Date.now());

  // Local state for configuration display
  const [config, setConfig] = useState({
    topic: 'Eburon Aegis Vision',
    language: 'English',
    voiceStyle: 'Dutch Flemish expressive'
  });

  const loadConfig = () => {
    setConfig({
        topic: localStorage.getItem('eburon_topic') || 'Eburon Aegis Vision',
        language: localStorage.getItem('eburon_language') || 'English',
        voiceStyle: localStorage.getItem('eburon_voice_style') || 'Dutch Flemish expressive'
    });
  };

  // Load config on mount and when status changes to disconnected (to refresh if settings changed)
  useEffect(() => {
    if (!status.isConnected) {
        loadConfig();
    }
  }, [status.isConnected]);

  // Listen for global config updates
  useEffect(() => {
    const handleConfigUpdate = () => loadConfig();
    window.addEventListener('eburon_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('eburon_config_updated', handleConfigUpdate);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, [disconnect]);

  // Track User Activity (Volume based) - Updates frequently
  useEffect(() => {
    // Only update user activity if the agent is NOT speaking.
    // When agent is speaking, status.volume represents agent audio, not user mic.
    // Increased threshold to 0.05 to filter out background noise/fans.
    if (!status.isSpeaking && status.volume > 0.05) {
      lastUserActivityRef.current = Date.now();
    }
  }, [status.volume, status.isSpeaking]);

  // Auto-Start Logic: Trigger the start message when connected
  useEffect(() => {
    if (status.isConnected && !hasStartedRef.current) {
      hasStartedRef.current = true;
      // Send the start trigger command
      // Wait 4 seconds (increased from 2s) to ensure connection stability before triggering speech
      // "Internal Error" often happens if text is sent while audio pipeline is still initializing
      setTimeout(() => {
          sendText("START BROADCAST NOW. Begin the 8-minute presentation immediately. Speak continuously. Do not stop. If you must pause, use a filler sound, then continue. Go.");
      }, 4000);
    } else if (!status.isConnected) {
      hasStartedRef.current = false;
    }
  }, [status.isConnected, sendText]);

  // Auto-Director Logic - Runs on state changes
  useEffect(() => {
    if (!status.isConnected) {
        isFinishedRef.current = false;
        isConcludingRef.current = false;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
        return;
    }

    // 1. Check for Finish Keywords in User Transcription
    // We check this only if we aren't already in the concluding phase
    if (!isConcludingRef.current && transcription.toLowerCase().match(/(wrap up|finish|conclusion|stop)/)) {
        isFinishedRef.current = true;
        isConcludingRef.current = true;
        
        // Silent command to wrap up
        sendText("[SYSTEM] The user has requested to finish. Wrap up now with a strong, memorable conclusion. Do not ask any further questions. Goodbye.");
        
        // Clear any existing silence timers immediately
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        return;
    }

    // 2. Concluding Sequence Monitor
    if (isConcludingRef.current) {
        if (status.isSpeaking) {
            // Agent is speaking the conclusion: ensure we don't disconnect yet
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
        } else {
            // Agent has stopped speaking (presumably finished conclusion): start disconnect timer
            if (!disconnectTimerRef.current) {
                disconnectTimerRef.current = setTimeout(() => {
                    disconnect();
                }, 4000); // 4 seconds of silence after wrap-up = Session End
            }
        }
        return; // Bypass normal auto-continue logic
    }

    // 3. Auto-Continue Logic (Normal Operation)
    if (!isFinishedRef.current) {
        if (status.isSpeaking) {
            // Agent is speaking: Clear timer
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        } else {
            // Agent is silent: Reset and Start Timer
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            
            silenceTimerRef.current = setTimeout(() => {
                // Check if user has been silent recently (avoid interrupting user)
                const timeSinceUserActivity = Date.now() - lastUserActivityRef.current;
                
                // Reduced wait time from 1500ms to 800ms for faster response
                if (timeSinceUserActivity > 800) {
                    // Send strict silent continuation directive
                    sendText("[SYSTEM] CONTINUATION SIGNAL: The audio stream paused. Resume your speech immediately from where you stopped. Do not acknowledge this interruption."); 
                }
            }, 100); // Instantly check (100ms) to prevent long pauses
        }
    } else {
        // If finished but not concluding (rare state), ensure no timers
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }

  }, [status.isConnected, status.isSpeaking, transcription, sendText, disconnect]);

  const handleAskNow = () => {
      // Prevent auto-disconnect if triggered near conclusion
      if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
      }
      
      // Stop any pending auto-continue prompts
      if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
      }

      // Reset conclusion state to allow Q&A
      isFinishedRef.current = false;
      isConcludingRef.current = false;

      sendText("[SYSTEM INTERRUPT] USER QUESTION PROTOCOL:\n1. Stop your presentation immediately.\n2. Acknowledge the user's question first (e.g. \"That is a valid point regarding...\").\n3. Answer the question in real-time, but STRICTLY within the scope of the current topic. DO NOT invent information. Elaborate on known facts only.\n4. If the question is unclear, ask for clarification.\n5. Ready to listen.");
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-zinc-900 to-black text-white relative overflow-hidden">
      {/* Header */}
      <div className="p-6 flex justify-between items-center z-10">
        <div>
          <h2 className="text-xs font-mono text-amber-500 tracking-widest">EBURON SYSTEM</h2>
          <h1 className="text-2xl font-bold tracking-tight text-white"> <span className="text-zinc-500 text-sm font-normal">v1.9</span></h1>
        </div>
        <div className="flex items-center gap-3">
            {status.isConnected && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700">
                    <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-zinc-400">LIVE</span>
                </div>
            )}
            {status.isReconnecting && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-900/30 border border-amber-700/50">
                    <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                    <span className="text-[10px] font-mono text-amber-400">RECONNECTING</span>
                </div>
            )}
            <div className={`w-3 h-3 rounded-full transition-colors duration-500 
                ${status.isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' 
                : status.isReconnecting ? 'bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                : 'bg-red-900'}`}>
            </div>
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        <AudioVisualizer 
            isActive={status.isConnected} 
            volume={status.volume} 
            isSpeaking={status.isSpeaking} 
        />
        
        {status.isConnected && (
            <div className="mt-8 text-center px-6 h-24 flex flex-col items-center gap-2">
                 {transcription && (
                     <p className="text-zinc-400 text-sm font-mono animate-pulse">
                         {transcription}
                     </p>
                 )}
                 
                 {status.isSpeaking && !transcription && (
                     <p className="text-cyan-500 text-xs font-mono tracking-widest">EBURON IS SPEAKING...</p>
                 )}

                 {!status.isSpeaking && !transcription && !status.error && (
                     <p className="text-amber-500 text-sm font-bold tracking-wide animate-bounce">
                         INITIALIZING BROADCAST...
                     </p>
                 )}

                 {status.error && (
                     <p className="text-red-500 text-xs font-mono bg-red-900/20 px-2 py-1 rounded animate-in fade-in slide-in-from-bottom-1">{status.error}</p>
                 )}
            </div>
        )}

        {/* Standby Config Display - Simplified */}
        {!status.isConnected && !status.isConnecting && !status.isReconnecting && (
             <div className="mt-12 px-6 w-full max-w-md text-center">
                 <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
                     <h3 className="text-xl font-bold text-white leading-tight tracking-tight">
                        "{config.topic}"
                     </h3>
                     <p className="text-xs text-zinc-500 font-mono tracking-widest uppercase">
                        {config.language} <span className="text-amber-500">•</span> {config.voiceStyle}
                     </p>
                 </div>

                 {status.error && (
                     <div className="mt-6">
                        <p className="text-red-400 text-xs font-mono bg-red-950/30 py-2 px-3 rounded border border-red-900/50 inline-block max-w-xs break-words">{status.error}</p>
                     </div>
                 )}
             </div>
        )}
        
        {status.isReconnecting && (
            <div className="mt-8 text-center px-6">
                <p className="text-amber-500 text-xs font-mono tracking-widest animate-pulse">ATTEMPTING RECONNECTION...</p>
                <p className="text-zinc-500 text-xs mt-1">{status.error}</p>
            </div>
        )}
      </div>

      {/* Controls - Flex Column to stack buttons */}
      <div className="p-8 pb-12 z-10 flex flex-col gap-3 justify-center items-center w-full">
         {status.isConnected && (
             <button 
                onClick={handleAskNow}
                className="w-full max-w-sm py-3 rounded-xl font-mono font-bold text-sm tracking-widest transition-all duration-300 shadow-lg flex items-center justify-center gap-3 bg-zinc-800 text-amber-500 border border-amber-500/50 hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 group"
             >
                <HelpCircle className="w-5 h-5 group-hover:text-amber-400 transition-colors" />
                ASK NOW
             </button>
         )}

         {!status.isConnected ? (
             <button 
                onClick={connect}
                disabled={status.isConnecting || status.isReconnecting}
                className={`w-full max-w-sm py-4 rounded-xl font-mono font-bold text-sm tracking-widest transition-all duration-300 shadow-lg flex items-center justify-center gap-3
                    ${status.isConnecting || status.isReconnecting
                        ? 'bg-zinc-800 text-zinc-500 cursor-wait border border-zinc-700' 
                        : 'bg-amber-600 text-white hover:bg-amber-500 hover:shadow-amber-500/20 active:scale-95 border border-amber-500'
                    }`}
             >
                {status.isConnecting || status.isReconnecting ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {status.isConnecting ? 'ESTABLISHING UPLINK...' : 'RECONNECTING...'}
                    </>
                ) : (
                    <>
                        START LIVE SESSION
                    </>
                )}
             </button>
         ) : (
            <button 
                onClick={disconnect}
                className="w-full max-w-sm py-4 rounded-xl font-mono font-bold text-sm tracking-widest transition-all duration-300 shadow-lg flex items-center justify-center gap-3 bg-red-900/80 text-red-200 border border-red-800 hover:bg-red-800 hover:text-white active:scale-95"
             >
                END SESSION
             </button>
         )}
      </div>

      {/* Background grid effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
               backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
           }}>
      </div>
    </div>
  );
};

export default LiveAgent;