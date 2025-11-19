import { Type } from '@google/genai';

export enum AppMode {
  HOME = 'HOME',
  LIVE_AGENT = 'LIVE_AGENT',
  CHAT = 'CHAT',
  THINKING = 'THINKING',
  TRANSCRIBE = 'TRANSCRIBE',
  SETTINGS = 'SETTINGS'
}

export interface Message {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  sources?: GroundingSource[];
  thinking?: boolean;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface LiveStatus {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  volume: number;
  error?: string;
}