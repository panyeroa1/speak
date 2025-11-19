import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
    ORUS_SYSTEM_PROMPT, 
    EBURON_TOPICS,
    FLEMISH_EXPRESSIONS_CONTENT,
    TAGALOG_EXPRESSIONS_CONTENT,
    SINGAPORE_EXPRESSIONS_CONTENT,
    TURKISH_EXPRESSIONS_CONTENT,
    ARABIC_EXPRESSIONS_CONTENT,
    FRENCH_EXPRESSIONS_CONTENT,
    MALAYALAM_EXPRESSIONS_CONTENT,
    SPANISH_EXPRESSIONS_CONTENT,
    GERMAN_EXPRESSIONS_CONTENT,
    HINDI_EXPRESSIONS_CONTENT,
    JAPANESE_EXPRESSIONS_CONTENT,
    KOREAN_EXPRESSIONS_CONTENT,
    ITALIAN_EXPRESSIONS_CONTENT,
    RUSSIAN_EXPRESSIONS_CONTENT
} from '../constants';
import { createPcmBlob, base64ToUint8Array, decodeAudioData, downsampleBuffer } from '../utils/audioUtils';
import { LiveStatus } from '../types';
import { supabase, getSessionId } from '../utils/supabaseClient';

export const useLiveApi = () => {
  const [status, setStatus] = useState<LiveStatus>({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isSpeaking: false,
    isListening: false,
    volume: 0,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const [transcription, setTranscription] = useState<string>('');
  const volumeGainNodeRef = useRef<GainNode | null>(null);
  
  // Sync Refs for Audio Loop
  const isSpeakingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const micVolumeRef = useRef<number>(0);
  const activeSessionIdRef = useRef<string>('');

  // Retry Logic Refs
  const isIntentionalDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const retryTimeoutRef = useRef<any | null>(null);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const MAX_RETRIES = 3;

  const connect = useCallback(async () => {
    // Prevent double connection
    if (sessionRef.current) return;

    // Clear any pending retry timeouts if manual connect is called
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    setStatus(s => ({ 
        ...s, 
        isConnecting: !s.isReconnecting, 
        error: s.isReconnecting ? s.error : undefined 
    }));

    isIntentionalDisconnectRef.current = false;
    const currentSessionId = crypto.randomUUID();
    activeSessionIdRef.current = currentSessionId;

    try {
        if(!process.env.API_KEY) {
            throw new Error("API_KEY not found in environment");
        }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 24000 });
      
      // Try to get 16k input, but browser might ignore this
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (inputCtx.state === 'suspended') await inputCtx.resume();

      audioContextRef.current = audioCtx;
      inputAudioContextRef.current = inputCtx;

      // Setup Output Analyser for Visualizer (Agent's Voice)
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.1;
      outputAnalyserRef.current = analyser;
      
      // Setup Volume Gain Node for Ducking
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;
      volumeGainNodeRef.current = gainNode;

      // STATIC WIRING: Gain -> Analyser -> Destination
      // We do this ONCE here, not in onmessage
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      // Start Visualizer Loop
      const updateVisualizer = () => {
        let vol = 0;
        
        // Audio Ducking Logic
        if (volumeGainNodeRef.current) {
            // If user is speaking loudly (> 0.1), duck agent volume to 0.2
            // Unless agent is currently silent, but we duck anyway to be safe
            const targetGain = micVolumeRef.current > 0.1 ? 0.2 : 1.0;
            
            // Smooth transition
            const currentGain = volumeGainNodeRef.current.gain.value;
            // Simple lerp for smoothness
            if (Math.abs(targetGain - currentGain) > 0.01) {
                volumeGainNodeRef.current.gain.value = currentGain + (targetGain - currentGain) * 0.1;
            } else {
                volumeGainNodeRef.current.gain.value = targetGain;
            }
        }
        
        if (isSpeakingRef.current && outputAnalyserRef.current) {
            // Agent is speaking: Use Output Analyser
            const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
            outputAnalyserRef.current.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            vol = Math.min((average / 128) * 1.5, 1);
        } else {
            // Agent is silent: Use Mic Volume (from Ref)
            vol = micVolumeRef.current;
        }
        
        setStatus(s => ({...s, volume: vol}));
        rafRef.current = requestAnimationFrame(updateVisualizer);
      };
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateVisualizer);

      // Get Mic Stream with Echo Cancellation
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
          } 
      });
      streamRef.current = stream;

      // Build System Instruction
      let systemInstruction = ORUS_SYSTEM_PROMPT;
      
      const selectedTopicTitle = localStorage.getItem('eburon_topic') || 'Eburon Aegis Vision';
      let topicContent = "";

      // 1. Look up in default static topics
      const defaultTopic = EBURON_TOPICS.topics.find(t => 
          t.topicTitle === selectedTopicTitle || 
          t.topicTitle.includes(selectedTopicTitle)
      );

      if (defaultTopic) {
          topicContent = defaultTopic.overview;
      } else {
          // 2. Look up in custom topics from Supabase
          try {
              const sessionId = getSessionId();
              const { data } = await supabase
                  .from('custom_topics')
                  .select('overview')
                  .eq('session_id', sessionId)
                  .eq('title', selectedTopicTitle)
                  .single();
              
              if (data) {
                  topicContent = data.overview;
              } else {
                  console.warn(`Topic "${selectedTopicTitle}" not found. Using default.`);
                  topicContent = EBURON_TOPICS.topics[0].overview; 
              }
          } catch (e) {
              console.warn("Error fetching custom topic, using default fallback", e);
              topicContent = EBURON_TOPICS.topics[0].overview; 
          }
      }

      systemInstruction += "\n\n" + "CURRENT TOPIC BRIEFING:\n" + topicContent;

      const voiceStyle = localStorage.getItem('eburon_voice_style') || 'Dutch Flemish expressive';
      const language = localStorage.getItem('eburon_language') || 'English';
      const selectedVoiceName = localStorage.getItem('eburon_voice_name') || 'Orus';
      
      let apiVoiceName = 'Fenrir'; 
      if (selectedVoiceName === 'Orus') {
          apiVoiceName = 'Fenrir'; 
      } else if (['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Aoede'].includes(selectedVoiceName)) {
          apiVoiceName = selectedVoiceName;
      }

      let expressionContent = "";
      if (voiceStyle.includes('Flemish') || voiceStyle.includes('Dutch')) expressionContent = FLEMISH_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Tagalog')) expressionContent = TAGALOG_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Singapore') || voiceStyle.includes('Singlish')) expressionContent = SINGAPORE_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Turkish')) expressionContent = TURKISH_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Arabic') || voiceStyle.includes('UAE')) expressionContent = ARABIC_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('French')) expressionContent = FRENCH_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Malayalam')) expressionContent = MALAYALAM_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Spanish') || voiceStyle.includes('Mexican')) expressionContent = SPANISH_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('German')) expressionContent = GERMAN_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Hindi')) expressionContent = HINDI_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Japanese')) expressionContent = JAPANESE_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Korean')) expressionContent = KOREAN_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Italian')) expressionContent = ITALIAN_EXPRESSIONS_CONTENT;
      else if (voiceStyle.includes('Russian')) expressionContent = RUSSIAN_EXPRESSIONS_CONTENT;

      if (expressionContent) systemInstruction += "\n\n" + expressionContent;

      systemInstruction += `\n\n*** VOICE IDENTITY & LANGUAGE PROTOCOL (CRITICAL) ***
      1. VOICE STYLE/ACCENT: You must strictly adopt a "${voiceStyle}" accent, tone, and persona. 
         - Even if speaking English, you must sound like a native speaker of that region speaking English.
         - You MUST use the provided cultural expressions/fillers from the NUANCE GUIDE naturally within your sentences.
         - **BREATHY DELIVERY:** Maintain a soft, breathy, naturally imperfect delivery throughout.
         - **ADDRESSING:** Use native address terms (e.g. "My friend", "Yaar", "Mone", "Habeebi") suited to the selected culture.
      2. OUTPUT LANGUAGE: You must speak in "${language}".
      
      *** FINAL AUDIO TAG ENFORCEMENT ***
      - DO NOT SPEAK BRACKETED TEXT.
      - [sigh] = Sound of sighing. NOT the word "sigh".
      `;

      // Connect
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: apiVoiceName } },
          },
          systemInstruction: systemInstruction,
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (activeSessionIdRef.current !== currentSessionId) return;

            setStatus(s => ({ 
                ...s, 
                isConnected: true, 
                isConnecting: false, 
                isReconnecting: false, 
                isListening: true, 
                error: undefined 
            }));
            
            reconnectAttemptRef.current = 0;
            
            // Setup Input Processing
            if (!inputAudioContextRef.current) return;
            
            const inputContext = inputAudioContextRef.current;
            const actualSampleRate = inputContext.sampleRate;
            
            const source = inputContext.createMediaStreamSource(stream);
            const processor = inputContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              // Safety check: Don't process if we are disconnected or session mismatch
              if (activeSessionIdRef.current !== currentSessionId) return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Visualizer logic
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              micVolumeRef.current = rms * 3; 

              // Downsample if necessary (Browser rarely honors 16000Hz requests perfectly)
              const processedData = downsampleBuffer(inputData, actualSampleRate, 16000);

              // Create blob and send
              const pcmBlob = createPcmBlob(processedData);
              
              sessionPromise.then(session => {
                try {
                    if (activeSessionIdRef.current === currentSessionId) {
                        session.sendRealtimeInput({ media: pcmBlob });
                    }
                } catch (e) {
                    // Ignore send errors
                }
              }).catch(() => {}); // Catch promise rejection
            };

            source.connect(processor);
            
            const gainNode = inputContext.createGain();
            gainNode.gain.value = 0; 
            processor.connect(gainNode);
            gainNode.connect(inputContext.destination);
            
            sourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (activeSessionIdRef.current !== currentSessionId) return;

            if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioData = msg.serverContent.modelTurn.parts[0].inlineData.data;
              if (audioContextRef.current && volumeGainNodeRef.current) {
                setStatus(s => ({...s, isSpeaking: true}));
                isSpeakingRef.current = true;
                
                const ctx = audioContextRef.current;
                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(audioData),
                  ctx
                );

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect source to the PERSISTENT Gain Node (the graph is already built)
                source.connect(volumeGainNodeRef.current);
                
                const currentTime = ctx.currentTime;
                if (nextStartTimeRef.current < currentTime) {
                    nextStartTimeRef.current = currentTime;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;

                source.onended = () => {
                    if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                         setStatus(s => ({...s, isSpeaking: false}));
                         isSpeakingRef.current = false;
                    }
                };
              }
            }

            if (msg.serverContent?.inputTranscription?.text) {
                 setTranscription(prev => `User: ${msg.serverContent?.inputTranscription?.text}`);
            }
            
            if (msg.serverContent?.interrupted) {
                nextStartTimeRef.current = 0;
                setStatus(s => ({...s, isSpeaking: false}));
                isSpeakingRef.current = false;
            }
          },
          onclose: () => {
            if (activeSessionIdRef.current !== currentSessionId) return;
            setStatus(s => ({ ...s, isConnected: false, isConnecting: false, isListening: false }));
            sessionRef.current = null;
            if (!isIntentionalDisconnectRef.current) {
                attemptReconnect();
            }
          },
          onerror: (e) => {
            if (activeSessionIdRef.current !== currentSessionId) return;
            console.error("Live API Error", e);
            
            let errorMessage = "Unknown Live API Error";
            if (e instanceof Error) errorMessage = e.message;
            else if ((e as any).message) errorMessage = (e as any).message;
            
            // Specific handling for "Network error"
            if (errorMessage.includes("Network error") || errorMessage.includes("network")) {
                errorMessage = "Network connection unstable. Retrying...";
                if (!isIntentionalDisconnectRef.current) {
                    // Faster retry for network blips
                    setTimeout(() => attemptReconnect(), 1000);
                }
            } else if (errorMessage.includes("Internal error") || errorMessage.includes("internal error")) {
                errorMessage = "API Internal Error. Retrying...";
                if (!isIntentionalDisconnectRef.current) {
                    setTimeout(() => attemptReconnect(), 1000);
                }
            } else if (!isIntentionalDisconnectRef.current) {
                attemptReconnect();
            }

            setStatus(s => ({ ...s, isConnected: false, isConnecting: false, isListening: false, error: errorMessage }));
            cleanupAudioNodes();
            sessionRef.current = null;
          }
        }
      });

      sessionRef.current = sessionPromise;
      sessionPromise.catch(err => {
          console.error("Session failed to initialize", err);
          sessionRef.current = null;
          if (!isIntentionalDisconnectRef.current) {
             attemptReconnect();
          } else {
             setStatus(s => ({ ...s, isConnected: false, isConnecting: false, error: "Connection Failed." }));
          }
      });

    } catch (error: any) {
      console.error("Failed to connect", error);
      setStatus(s => ({ ...s, isConnecting: false, error: error.message }));
      sessionRef.current = null;
      if (!isIntentionalDisconnectRef.current) {
          attemptReconnect();
      }
    }
  }, []);

  // Helper to allow recursive calls
  useEffect(() => {
      connectRef.current = connect;
  }, [connect]);

  const cleanupAudioNodes = () => {
      if (sourceRef.current) {
          try { sourceRef.current.disconnect(); } catch(e) {}
          sourceRef.current = null;
      }
      if (processorRef.current) {
          try { processorRef.current.disconnect(); } catch(e) {}
          processorRef.current = null;
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }
      // Do not close contexts, just suspend/cleanup nodes
  };

  const attemptReconnect = () => {
      if (reconnectAttemptRef.current < MAX_RETRIES) {
          reconnectAttemptRef.current += 1;
          const delay = Math.min(1000 * (2 ** (reconnectAttemptRef.current - 1)), 5000);
          
          console.log(`Attempting reconnect ${reconnectAttemptRef.current}/${MAX_RETRIES} in ${delay}ms`);
          
          setStatus(s => ({ 
              ...s, 
              isReconnecting: true, 
              error: `Connection lost. Retrying (${reconnectAttemptRef.current}/${MAX_RETRIES})...` 
          }));
          
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          
          retryTimeoutRef.current = setTimeout(() => {
              if (connectRef.current) connectRef.current();
          }, delay);
      } else {
          setStatus(s => ({ 
              ...s, 
              isReconnecting: false, 
              error: "Connection failed. Check network or API key." 
          }));
          reconnectAttemptRef.current = 0;
      }
  };

  const disconnect = useCallback(() => {
    isIntentionalDisconnectRef.current = true;
    activeSessionIdRef.current = ''; // Invalidate session immediately
    
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    reconnectAttemptRef.current = 0;
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    isSpeakingRef.current = false;

    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
          if(session.close) session.close();
      }).catch(() => {});
    }
    
    sessionRef.current = null;
    cleanupAudioNodes();

    if (audioContextRef.current) audioContextRef.current.close();
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    audioContextRef.current = null;
    inputAudioContextRef.current = null;

    setStatus({
      isConnected: false,
      isConnecting: false,
      isReconnecting: false,
      isSpeaking: false,
      isListening: false,
      volume: 0
    });
    setTranscription('');
  }, []);

  const sendText = useCallback((text: string) => {
      if (sessionRef.current) {
          sessionRef.current.then((session: any) => {
              if (typeof session.send === 'function') {
                  try {
                      session.send({ 
                          clientContent: { 
                              turns: [{ role: 'user', parts: [{ text }] }], 
                              turnComplete: true 
                          } 
                      });
                  } catch (e) {
                      console.warn("Failed to send text", e);
                  }
              }
          }).catch(() => {});
      }
  }, []);

  return {
    connect,
    disconnect,
    sendText,
    status,
    transcription
  };
};