

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, ChevronDown, FileText, CheckCircle, Mic, Globe, Save, Cloud, AlertCircle, Loader2, Volume2 } from 'lucide-react';
import { supabase, getSessionId } from '../utils/supabaseClient';

const Settings: React.FC = () => {
  const [topic, setTopic] = useState<string>('Eburon Aegis Vision');
  const [voiceStyle, setVoiceStyle] = useState<string>('Dutch Flemish expressive');
  const [language, setLanguage] = useState<string>('English');
  const [voiceName, setVoiceName] = useState<string>('Orus');

  const [isSaved, setIsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const validTopics = ['Eburon Aegis Vision', 'Eburon Flyer', 'Decobu Messenger'];

  // Load initial settings from LocalStorage then try Supabase
  useEffect(() => {
      const localTopic = localStorage.getItem('eburon_topic');
      const localVoiceStyle = localStorage.getItem('eburon_voice_style');
      const localLang = localStorage.getItem('eburon_language');
      const localVoiceName = localStorage.getItem('eburon_voice_name');

      // Validate and Load Topic
      if (localTopic && validTopics.includes(localTopic)) {
          setTopic(localTopic);
      } else {
          // Auto-correction for invalid or legacy topics (fixes network errors caused by missing content)
          setTopic('Eburon Aegis Vision');
          localStorage.setItem('eburon_topic', 'Eburon Aegis Vision');
      }

      if (localVoiceStyle) setVoiceStyle(localVoiceStyle);
      if (localLang) setLanguage(localLang);
      if (localVoiceName) setVoiceName(localVoiceName);

      fetchSettingsFromSupabase();
  }, []);

  const fetchSettingsFromSupabase = async () => {
      setIsSyncing(true);
      const sessionId = getSessionId();
      try {
          const { data, error } = await supabase
              .from('settings')
              .select('*')
              .eq('session_id', sessionId)
              .single();
          
          if (data && !error) {
              if (data.topic) {
                  if (validTopics.includes(data.topic)) {
                      setTopic(data.topic);
                      localStorage.setItem('eburon_topic', data.topic);
                  } else {
                      // Force update if DB has stale topic
                      setTopic('Eburon Aegis Vision');
                      localStorage.setItem('eburon_topic', 'Eburon Aegis Vision');
                  }
              }
              if (data.voice_style) {
                  setVoiceStyle(data.voice_style);
                  localStorage.setItem('eburon_voice_style', data.voice_style);
              }
              if (data.language) {
                  setLanguage(data.language);
                  localStorage.setItem('eburon_language', data.language);
              }
              // Note: voice_name is currently local-only to avoid schema migrations
              window.dispatchEvent(new Event('eburon_config_updated'));
          }
      } catch (err) {
          console.warn("Supabase sync skipped or failed (using local)", err);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleSave = async () => {
      setSyncError(null);
      setIsSyncing(true);

      // 1. Save Local
      localStorage.setItem('eburon_topic', topic);
      localStorage.setItem('eburon_voice_style', voiceStyle);
      localStorage.setItem('eburon_language', language);
      localStorage.setItem('eburon_voice_name', voiceName);
      
      // Dispatch event to notify LiveAgent
      window.dispatchEvent(new Event('eburon_config_updated'));

      // 2. Save to Supabase
      const sessionId = getSessionId();
      try {
          // We omit voice_name from Supabase upsert to prevent errors if column doesn't exist
          const { error } = await supabase
              .from('settings')
              .upsert({ 
                  session_id: sessionId, 
                  topic, 
                  voice_style: voiceStyle, 
                  language,
                  updated_at: new Date().toISOString()
              }, { onConflict: 'session_id' });
          
          if (error) throw error;
          
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 3000);
      } catch (err: any) {
          let errorMsg = "Unknown error";
          if (typeof err === 'string') errorMsg = err;
          else if (err?.message) errorMsg = err.message;
          else {
              try { errorMsg = JSON.stringify(err); } catch (e) { errorMsg = "Unserializable Error"; }
          }

          console.error("Failed to save to Cloud DB:", err);
          setSyncError(`Saved locally. Cloud sync error: ${errorMsg.substring(0, 50)}...`);
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 4000);
      } finally {
          setIsSyncing(false);
      }
  };

  const voiceStyles = [
    "Dutch Flemish expressive",
    "Tagalog English Mix",
    "Singaporean Singlish Casual",
    "Turkish Local Language",
    "Arabic Accent UAE National",
    "French Grown Native Speaking",
    "Malayalam Indian Native",
    "Spanish Mexican Passionate",
    "German Professional Direct",
    "Hindi English Hybrid",
    "Japanese Business Formal",
    "Korean Modern Seoul",
    "Italian Expressive Gesture",
    "Russian Direct Tech"
  ];

  // Map internal voice IDs to Star Aliases for UI display
  const voiceOptions = [
    { id: "Orus", label: "Sirius (System Default)" },
    { id: "Puck", label: "Vega" },
    { id: "Charon", label: "Antares" },
    { id: "Kore", label: "Capella" },
    { id: "Fenrir", label: "Rigel" },
    { id: "Aoede", label: "Spica" },
    { id: "Zephyr", label: "Altair" }
  ];

  const languages = [
    "Afrikaans", "Albanian", "Amharic", "Arabic", "Armenian", "Assamese", "Aymara", "Azerbaijani", 
    "Bambara", "Basque", "Belarusian", "Bengali", "Bhojpuri", "Bosnian", "Bulgarian", 
    "Catalan", "Cebuano", "Chichewa", "Chinese (Simplified)", "Chinese (Traditional)", "Corsican", "Croatian", "Czech", 
    "Danish", "Dhivehi", "Dogri", "Dutch", 
    "English", "Esperanto", "Estonian", "Ewe", 
    "Filipino (Tagalog)", "Finnish", "French", "Frisian", 
    "Galician", "Georgian", "German", "Greek", "Guarani", "Gujarati", 
    "Haitian Creole", "Hausa", "Hawaiian", "Hebrew", "Hindi", "Hmong", "Hungarian", 
    "Icelandic", "Igbo", "Ilocano", "Indonesian", "Irish", "Italian", 
    "Japanese", "Javanese", 
    "Kannada", "Kazakh", "Khmer", "Kinyarwanda", "Konkani", "Korean", "Krio", "Kurdish (Kurmanji)", "Kurdish (Sorani)", "Kyrgyz", 
    "Lao", "Latin", "Latvian", "Lingala", "Lithuanian", "Luganda", "Luxembourgish", 
    "Macedonian", "Maithili", "Malagasy", "Malay", "Malayalam", "Maltese", "Maori", "Marathi", "Meiteilon (Manipuri)", "Mizo", "Mongolian", "Myanmar (Burmese)", 
    "Nepali", "Norwegian", 
    "Odia (Oriya)", "Oromo", 
    "Pashto", "Persian", "Polish", "Portuguese", "Punjabi", 
    "Quechua", 
    "Romanian", "Russian", 
    "Samoan", "Sanskrit", "Scots Gaelic", "Sepedi", "Serbian", "Sesotho", "Shona", "Sindhi", "Sinhala", "Slovak", "Slovenian", "Somali", "Spanish", "Sundanese", "Swahili", "Swedish", 
    "Tajik", "Tamil", "Tatar", "Telugu", "Thai", "Tigrinya", "Tsonga", "Turkish", "Turkmen", "Twi", 
    "Ukrainian", "Urdu", "Uyghur", "Uzbek", 
    "Vietnamese", 
    "Welsh", 
    "Xhosa", 
    "Yiddish", "Yoruba", 
    "Zulu"
  ];

  return (
    <div className="h-full bg-gradient-to-b from-zinc-900 to-black text-white flex flex-col relative overflow-hidden">
      {/* Background grid effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
           style={{ 
               backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
           }}>
      </div>

      {/* Header */}
      <div className="p-6 border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md z-10">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <SettingsIcon className="w-6 h-6 text-amber-500" />
                System Configuration
                </h2>
                <p className="text-xs text-zinc-400 mt-1 font-mono">KNOWLEDGE BASE & VOICE PARAMETERS</p>
            </div>
            <div className="flex items-center gap-2">
                {isSyncing ? (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> SYNCING DB
                    </div>
                ) : (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-600">
                         <Cloud className="w-3 h-3" /> DB READY
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Scrollable Content with bottom padding to avoid footer overlap */}
      <div className="flex-1 p-6 overflow-y-auto z-10 pb-48">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* Topic Selector */}
          <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Active Knowledge Topic
                </label>
                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded border border-amber-500/20">
                    READY
                </span>
            </div>
            
            <div className="relative group">
              <select 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg p-4 appearance-none focus:border-amber-500 outline-none text-white font-mono text-sm transition-colors cursor-pointer group-hover:border-zinc-600"
              >
                <option value="Eburon Aegis Vision">Eburon Aegis Vision Security</option>
                <option value="Eburon Flyer">Eburon Flyer Project</option>
                <option value="Decobu Messenger">Decobu Messenger Security</option>
                <option value="Eburon Architecture" disabled>Eburon Architecture (Coming Soon)</option>
                <option value="Voice Synthesis" disabled>Voice Synthesis Protocols (Coming Soon)</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Voice Model Selector */}
          <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Base Voice Model (Star Alias)
                </label>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded border border-zinc-700">
                    SYSTEM
                </span>
            </div>
            
            <div className="relative group">
              <select 
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg p-4 appearance-none focus:border-amber-500 outline-none text-white font-mono text-sm transition-colors cursor-pointer group-hover:border-zinc-600"
              >
                {voiceOptions.map(voice => (
                    <option key={voice.id} value={voice.id}>{voice.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Voice Style */}
          <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Accent & Mannerisms
                </label>
            </div>
            
            <div className="relative group">
              <select 
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value)}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg p-4 appearance-none focus:border-amber-500 outline-none text-white font-mono text-sm transition-colors cursor-pointer group-hover:border-zinc-600"
              >
                {voiceStyles.map(style => (
                    <option key={style} value={style}>{style}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Language */}
          <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Output Language
                </label>
            </div>
            
            <div className="relative group">
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg p-4 appearance-none focus:border-amber-500 outline-none text-white font-mono text-sm transition-colors cursor-pointer group-hover:border-zinc-600"
              >
                 {languages.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer - Always Visible */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-zinc-950 to-transparent z-20 flex flex-col items-center justify-end pb-6">
         <div className="w-full max-w-md flex flex-col items-center gap-4 relative">
            
            {/* Floating Notifications (Toasts) */}
            <div className="absolute bottom-20 w-full flex flex-col items-center gap-2 pointer-events-none">
                 {/* Success Toast */}
                 <div className={`transform transition-all duration-500 ease-out ${isSaved && !syncError ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                     <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-full backdrop-blur-xl shadow-2xl shadow-emerald-900/20">
                         <CheckCircle className="w-4 h-4" />
                         <span className="text-sm font-bold tracking-wide">CONFIG SAVED & SYNCED</span>
                     </div>
                 </div>

                 {/* Error Toast */}
                 <div className={`transform transition-all duration-500 ease-out ${syncError ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-full backdrop-blur-xl shadow-2xl max-w-xs">
                         <AlertCircle className="w-4 h-4 flex-shrink-0" />
                         <span className="text-xs font-mono truncate">{syncError}</span>
                    </div>
                 </div>
            </div>

            {/* Main Save Button */}
            <button 
                onClick={handleSave}
                disabled={isSyncing}
                className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-xl font-bold tracking-widest flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl hover:shadow-white/10 active:scale-95 transition-all duration-200 border border-zinc-400/20"
            >
                {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isSyncing ? 'SYNCING DATABASE...' : 'SAVE CONFIGURATION'}
            </button>
         </div>
      </div>
    </div>
  );
};

export default Settings;
