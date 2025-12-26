/*
 * @Author: Wind
 * @Date: 2025-12-22 02:18:53
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, ExternalLink, Music2, X, Minus, Maximize2 } from 'lucide-react';
import { getNative, initNativeBridge } from '../utils/nativeBridge';

const SCALE = 0.56; 
const CHANNEL_NAME = 'hm-overlay-comm-v1';

const OverlayBall: React.FC = () => {
  const native = useRef(initNativeBridge() || getNative());
  const [playerState, setPlayerState] = useState<any>({ song: null, isPlaying: false });
  const [pos, setPos] = useState({ x: 100, y: 100 });
  const draggingRef = useRef(false);
  const startCoord = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e) => {
      if (e.data.type === 'state') setPlayerState(e.data.payload);
    };
    channel.postMessage({ type: 'request_sync' });
    return () => channel.close();
  }, []);

  const handleDrag = (e: React.PointerEvent) => {
    draggingRef.current = true;
    startCoord.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = ev.clientX - startCoord.current.x;
      const dy = ev.clientY - startCoord.current.y;
      const nx = startCoord.current.ox + dx;
      const ny = startCoord.current.oy + dy;
      setPos({ x: nx, y: ny });
      native.current?.overlay?.move?.(nx * SCALE, ny * SCALE);
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const sendCommand = (action: string) => {
    new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'command', action });
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-white/98 rounded-[28px] shadow-2xl overflow-hidden border border-black/5 select-none">
      <div 
        onPointerDown={handleDrag}
        className="h-14 flex items-center justify-between px-5 cursor-move text-white shrink-0"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
      >
        <div className="flex items-center gap-2 font-black italic tracking-tighter">
          <Music2 size={20} />
          <span>Lynx MUSIC</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => native.current?.overlay?.minimize()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"><Minus size={16}/></button>
          <button onClick={() => native.current?.overlay?.close()} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600"><X size={16}/></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between py-8 px-6 bg-slate-50/50">
        <div 
          className={`w-48 h-48 rounded-[40px] shadow-2xl bg-cover bg-center border-4 border-white transition-transform duration-500 ${playerState.isPlaying ? 'scale-105' : 'scale-100'}`}
          style={{ backgroundImage: `url(${playerState.song?.coverUrl || ''})`, backgroundColor: '#eee' }}
        />
        <div className="text-center w-full px-2">
          <h2 className="text-slate-900 font-black text-xl truncate">{playerState.song?.title || '等待播放'}</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{playerState.song?.artist || 'LynxMusic'}</p>
        </div>
        <div className="flex items-center gap-10">
          <button onClick={() => sendCommand('prev')} className="text-slate-400 hover:text-indigo-600"><SkipBack fill="currentColor" size={32}/></button>
          <button 
            onClick={() => sendCommand('toggle')}
            className="w-20 h-20 flex items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl active:scale-95 transition-all"
          >
            {playerState.isPlaying ? <Pause fill="currentColor" size={36}/> : <Play fill="currentColor" size={36} className="ml-1"/>}
          </button>
          <button onClick={() => sendCommand('next')} className="text-slate-400 hover:text-indigo-600"><SkipForward fill="currentColor" size={32}/></button>
        </div>
        <button onClick={() => sendCommand('open')} className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 text-[11px] font-bold py-2 px-4 rounded-full border border-slate-200">
          返回主页面 <ExternalLink size={12}/>
        </button>
      </div>
    </div>
  );
};

export default OverlayBall;