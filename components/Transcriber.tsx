
import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Mic, StopCircle, FileText, Loader2, UploadCloud, Check } from 'lucide-react';
import { arrayBufferToBase64 } from '../utils/audioUtils';
import { supabase, getSessionId } from '../utils/supabaseClient';

const Transcriber: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            
            recorder.onstop = processAudio;
            recorder.start();
            setIsRecording(true);
            setTranscription('');
            setUploadStatus('idle');
            mediaRecorderRef.current = recorder;
        } catch (e) {
            console.error("Mic error", e);
            alert("Microphone access denied");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
    };

    const processAudio = async () => {
        setIsProcessing(true);
        try {
            const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const buffer = await audioBlob.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);

            // 1. Transcribe with Gemini
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'audio/webm', data: base64 } },
                        { text: "Please transcribe this audio exactly as spoken." }
                    ]
                }
            });
            
            const text = response.text || "No text found.";
            setTranscription(text);

            // 2. Upload to Supabase Storage
            setUploadStatus('uploading');
            const sessionId = getSessionId();
            const fileName = `${sessionId}/${Date.now()}.webm`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('recordings')
                .upload(fileName, audioBlob);

            if (uploadError) {
                console.error("Upload failed", uploadError);
                setUploadStatus('error');
            } else {
                // 3. Save Metadata to DB
                const { data: publicUrlData } = supabase.storage.from('recordings').getPublicUrl(fileName);
                
                await supabase.from('transcriptions').insert({
                    session_id: sessionId,
                    audio_url: publicUrlData.publicUrl,
                    transcript: text,
                    created_at: new Date().toISOString()
                });

                setUploadStatus('done');
            }

        } catch (e: any) {
            setTranscription(`Error: ${e.message}`);
            setUploadStatus('error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-zinc-900 to-black text-white relative overflow-hidden">
             {/* Background grid effect */}
            <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
                style={{ 
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
                    backgroundSize: '40px 40px' 
                }}>
            </div>

            <div className="max-w-md w-full space-y-8 text-center z-10 p-6">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-white">Audio Transcription</h2>
                    <p className="text-zinc-400 text-sm">Record audio to transcribe using Eburon STT Flash</p>
                </div>

                <div className="flex justify-center">
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isProcessing}
                        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                            isRecording 
                            ? 'bg-red-500/20 text-red-500 border-2 border-red-500 animate-pulse shadow-red-500/20' 
                            : 'bg-zinc-800 text-zinc-400 hover:bg-amber-600 hover:text-white border border-zinc-700'
                        }`}
                    >
                        {isProcessing ? (
                            <Loader2 className="w-8 h-8 animate-spin" />
                        ) : isRecording ? (
                            <StopCircle className="w-10 h-10" />
                        ) : (
                            <Mic className="w-10 h-10" />
                        )}
                    </button>
                </div>

                {transcription && (
                    <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl p-6 text-left border border-zinc-800 w-full shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-amber-500 font-mono text-xs uppercase">
                                <FileText className="w-4 h-4" />
                                Transcript
                            </div>
                            {uploadStatus === 'uploading' && <div className="flex items-center gap-1 text-zinc-500 text-[10px]"><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</div>}
                            {uploadStatus === 'done' && <div className="flex items-center gap-1 text-green-500 text-[10px]"><Check className="w-3 h-3" /> Saved to Cloud</div>}
                            {uploadStatus === 'error' && <div className="flex items-center gap-1 text-red-500 text-[10px]">Upload Failed</div>}
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-300">{transcription}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Transcriber;
