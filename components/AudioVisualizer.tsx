import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  volume: number; // 0 to 1
  isSpeaking: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, volume, isSpeaking }) => {
  return (
    <div className="flex items-center justify-center h-48 w-full relative overflow-hidden">
      {/* Central Orb */}
      <div className={`relative z-10 transition-all duration-300 rounded-full flex items-center justify-center
        ${isActive ? 'w-32 h-32 shadow-[0_0_60px_-10px_rgba(245,158,11,0.6)]' : 'w-24 h-24 opacity-50'}
        bg-zinc-900 border-2 border-amber-500/30
      `}>
         <div className={`absolute inset-0 rounded-full bg-amber-500/10 blur-md transition-transform duration-100`}
              style={{ transform: `scale(${1 + volume * 5})` }}
         ></div>
         
         {/* Core */}
         <div className="w-4 h-4 bg-amber-400 rounded-full shadow-lg shadow-amber-500/50 animate-pulse"></div>
      </div>

      {/* Ring Waves */}
      {isActive && (
        <>
          <div className="absolute w-64 h-64 rounded-full border border-amber-500/20 animate-[ping_3s_linear_infinite]"></div>
          <div className="absolute w-48 h-48 rounded-full border border-amber-500/20 animate-[ping_3s_linear_infinite_1s]"></div>
        </>
      )}

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent blur-sm animate-pulse"></div>
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;