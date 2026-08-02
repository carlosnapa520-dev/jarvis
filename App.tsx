import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveService } from './services/liveService';
import { ConnectionState, MessageLog } from './types';
import Visualizer from './components/Visualizer';
import CameraFeed from './components/CameraFeed';
import { Play, Mic, MicOff, Search, Image as ImageIcon, Camera, Activity, Lock, ChevronRight } from 'lucide-react';

export default function App() {
  const [hasKey, setHasKey] = useState(false);
  const [state, setState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState(0);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const liveService = useRef<LiveService | null>(null);
  const [activeMedia, setActiveMedia] = useState<MessageLog | null>(null);

  useEffect(() => {
        setHasKey(true);
    }, []);
  
  useEffect(() => {
    if (!hasKey) return;

    liveService.current = new LiveService();
    liveService.current.onStateChange = setState;
    liveService.current.onVolume = setVolume;
    liveService.current.onMessage = (msg) => {
      setMessages(prev => [msg, ...prev]);
      if (msg.metadata) {
        setActiveMedia(msg);
      }
    };

    return () => {
      liveService.current?.disconnect();
    };
  }, [hasKey]);

  const handleConnect = () => {
    if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
      liveService.current?.connect();
    } else {
      liveService.current?.disconnect();
    }
  };

  // Critical fix: stabilize the callback reference to prevent CameraFeed re-initialization
  const handleFrame = useCallback((base64: string) => {
    liveService.current?.updateCameraFrame(base64);
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      try {
        await (window as any).aistudio.openSelectKey();
        // Race condition mitigation: assume success
        setHasKey(true);
      } catch (e) {
        console.error("Key selection failed", e);
      }
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20" 
             style={{ 
               backgroundImage: 'linear-gradient(rgba(14, 165, 233, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 165, 233, 0.1) 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
             }}>
        </div>
        
        <div className="z-10 bg-slate-900/80 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full text-center backdrop-blur-md">
           <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyan-500/30">
              <Lock className="w-8 h-8 text-cyan-400" />
           </div>
           
           <h1 className="text-3xl font-bold font-hud text-white mb-2 tracking-wide">JARVIS SYSTEM</h1>
           <p className="text-slate-400 mb-8 font-mono text-sm">Authentication Required for Neural Link</p>
           
           <button 
             onClick={handleSelectKey}
             className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold tracking-widest uppercase transition-all shadow-lg hover:shadow-cyan-500/25 flex items-center justify-center gap-2 group"
           >
             <span>Authenticate</span>
             <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
           </button>
           
           <div className="mt-6 text-xs text-slate-500">
             <p>Access requires a valid Google Cloud API Key with billing enabled for Gemini 2.5 and Imagen 3 models.</p>
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400 underline mt-2 inline-block">View Billing Documentation</a>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden relative selection:bg-cyan-500/30">
      
      {/* Background Grid Animation */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" 
           style={{ 
             backgroundImage: 'linear-gradient(rgba(14, 165, 233, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 165, 233, 0.1) 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }}>
      </div>

      {/* LEFT COLUMN: Controls & Logs */}
      <div className="w-full md:w-1/3 lg:w-1/4 p-4 md:p-6 flex flex-col gap-6 z-10 bg-slate-900/80 backdrop-blur-md border-r border-slate-800">
        <header>
          <h1 className="text-4xl font-bold font-hud text-cyan-400 tracking-tighter mb-1">JARVIS</h1>
          <p className="text-xs text-cyan-600 font-mono uppercase tracking-[0.2em]">Live Interface System</p>
        </header>
        
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg border ${state === ConnectionState.CONNECTED ? 'border-cyan-500/30 bg-cyan-950/20' : 'border-red-500/30 bg-red-950/20'} transition-colors duration-500`}>
             <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 uppercase">System Status</span>
                <span className={`text-xs font-bold uppercase ${state === ConnectionState.CONNECTED ? 'text-cyan-400' : 'text-red-400'}`}>
                  {state}
                </span>
             </div>
             {state === ConnectionState.CONNECTED && (
               <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 animate-pulse w-full"></div>
               </div>
             )}
          </div>

          {/* Activity Log */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mask-image-b">
             <div className="text-xs font-mono text-slate-500 uppercase tracking-widest sticky top-0 bg-slate-900/90 py-1 mb-2">Operation Log</div>
             {messages.length === 0 && (
               <div className="text-sm text-slate-600 italic mt-10 text-center">Awaiting inputs...</div>
             )}
             {messages.map((m) => (
                <div key={m.id} className="text-sm group animate-in fade-in slide-in-from-left-2 duration-300">
                  <div className="flex items-center gap-2 mb-1">
                     {m.role === 'model' && <Activity className="w-3 h-3 text-cyan-400" />}
                     {m.metadata?.type === 'search' && <Search className="w-3 h-3 text-yellow-400" />}
                     {m.metadata?.type === 'image_gen' && <ImageIcon className="w-3 h-3 text-purple-400" />}
                     {m.metadata?.type === 'reimagine' && <Camera className="w-3 h-3 text-pink-400" />}
                     <span className="text-xs text-slate-500 font-mono">{m.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-300 pl-5 border-l border-slate-700 py-1">
                     {m.text}
                  </div>
                </div>
             ))}
          </div>
        </div>

        {/* Control Button */}
        <button
          onClick={handleConnect}
          disabled={state === ConnectionState.CONNECTING}
          className={`
            w-full py-4 rounded-xl font-hud text-lg tracking-widest uppercase transition-all duration-300 shadow-lg
            flex items-center justify-center gap-3
            ${state === ConnectionState.CONNECTED 
              ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 shadow-red-500/20' 
              : 'bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 shadow-cyan-500/20 hover:shadow-cyan-400/40'}
          `}
        >
          {state === ConnectionState.CONNECTED ? (
             <><MicOff className="w-5 h-5" /> Disconnect</>
          ) : state === ConnectionState.CONNECTING ? (
             <span className="animate-pulse">Initializing...</span>
          ) : (
             <><Mic className="w-5 h-5" /> Initialize</>
          )}
        </button>
      </div>

      {/* RIGHT COLUMN: Visualizer & Output */}
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 relative z-10">
         
         {/* Top Section: Visualizer & Camera */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[320px]">
            {/* Audio Visualizer */}
            <div className="relative rounded-2xl border border-slate-700 bg-slate-900/50 flex items-center justify-center overflow-hidden">
               <div className="absolute top-3 left-4 text-[10px] text-cyan-500 font-hud tracking-widest uppercase">Audio Input Matrix</div>
               <Visualizer volume={volume} active={state === ConnectionState.CONNECTED} />
            </div>

            {/* Camera Feed */}
            <div className="relative rounded-2xl border border-slate-700 bg-slate-900/50 flex items-center justify-center p-2">
               <div className="absolute top-3 left-4 text-[10px] text-cyan-500 font-hud tracking-widest uppercase z-10">&nbsp;</div>
               <div className="w-full h-full relative rounded-lg overflow-hidden">
                 <CameraFeed active={state === ConnectionState.CONNECTED} onFrame={handleFrame} />
                 {!state && <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-mono text-sm">System Offline</div>}
               </div>
            </div>
         </div>

         {/* Bottom Section: Media Output */}
         <div className="flex-1 rounded-2xl border border-slate-700 bg-slate-900/50 p-6 relative overflow-hidden min-h-[300px]">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
            <div className="absolute top-4 left-6 text-[10px] text-cyan-500 font-hud tracking-widest uppercase flex items-center gap-2">
              <span>Main Output Display</span>
              {activeMedia && <span className="px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-200 border border-cyan-700/50 text-[9px]">{activeMedia.metadata?.type}</span>}
            </div>
            
            <div className="h-full w-full flex items-center justify-center overflow-auto mt-6">
               {!activeMedia ? (
                 <div className="flex flex-col items-center justify-center text-slate-600 gap-4">
                    <Activity className="w-16 h-16 opacity-20" />
                    <p className="font-mono text-sm tracking-wide">Waiting for system output...</p>
                 </div>
               ) : (
                 <div className="w-full h-full flex flex-col items-center animate-in zoom-in-95 duration-500">
                    {activeMedia.metadata?.image && (
                      <div className="relative group max-w-full max-h-full">
                         <img 
                           src={activeMedia.metadata.image} 
                           alt="Generated content" 
                           className="max-h-[400px] w-auto rounded-lg shadow-2xl border border-slate-600"
                         />
                         <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur font-mono">
                            Generated by Gemini
                         </div>
                      </div>
                    )}

                    {activeMedia.metadata?.sources && (
                      <div className="w-full max-w-2xl bg-slate-800/50 rounded-lg border border-slate-700 p-4">
                         <h3 className="text-cyan-400 font-hud text-sm mb-3 uppercase tracking-wider">Grounding Sources</h3>
                         <ul className="space-y-2">
                           {activeMedia.metadata.sources.map((src, i) => (
                             <li key={i} className="flex items-start gap-3 p-2 rounded hover:bg-slate-700/50 transition-colors">
                                <span className="bg-slate-700 text-slate-300 text-xs w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 font-mono">{i + 1}</span>
                                <a href={src.uri} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200 hover:underline truncate">
                                  {src.title}
                                </a>
                             </li>
                           ))}
                         </ul>
                      </div>
                    )}
                 </div>
               )}
            </div>
         </div>
         
      </div>

    </div>
  );
}
