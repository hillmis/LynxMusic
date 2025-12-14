import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { ChevronDown, SkipBack, Play, Pause, SkipForward, Repeat, Shuffle, Heart, Share2, ListMusic, Volume2, Repeat1 } from 'lucide-react';

interface PlayingProps {
  song: Song | null;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const Playing: React.FC<PlayingProps> = ({ song, isPlaying, onClose, onTogglePlay, onNext, onPrev }) => {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(song?.duration || 180);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    if (!song) return;
    setDuration(song.duration);
    setProgress(0);
    setIsLiked(false); 
  }, [song]);

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setProgress(prev => (prev < duration ? prev + 1 : prev));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const toggleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  if (!song) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Dynamic Background Blur */}
      <div className="absolute inset-0 z-0">
        <img src={song.coverUrl} alt="bg" className="w-full h-full object-cover blur-3xl opacity-30 scale-125" />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-6 mt-2">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white">
          <ChevronDown size={28} />
        </button>
        <div className="text-center">
          <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400">正在播放</h3>
        </div>
        <button className="p-2 text-slate-300 hover:text-white">
          <Share2 size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
        {/* Album Art (Rotating if playing) */}
        <div className="relative w-72 h-72 mb-10">
            <div className={`w-full h-full rounded-full overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] border-4 border-slate-800/50 ${isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}>
                 <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
            </div>
            {/* Center hole for vinyl look */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-slate-900 rounded-full border border-slate-700" />
        </div>

        {/* Info */}
        <div className="w-full flex justify-between items-end mb-8">
            <div className="flex-1">
                <h2 className="text-2xl font-bold truncate mb-1">{song.title}</h2>
                <p className="text-slate-400 text-lg truncate">{song.artist}</p>
            </div>
            <button 
                onClick={() => setIsLiked(!isLiked)}
                className={`${isLiked ? 'text-red-500 scale-110' : 'text-slate-400'} hover:scale-110 transition-all mb-2`}
            >
                <Heart size={28} fill={isLiked ? "currentColor" : "none"} />
            </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full mb-2">
            <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden cursor-pointer group">
                <div 
                    className="h-full bg-indigo-500 group-hover:bg-indigo-400 transition-colors" 
                    style={{ width: `${(progress / duration) * 100}%` }}
                />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
            </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between w-full mt-6 mb-8">
            <button 
                onClick={() => setIsShuffle(!isShuffle)}
                className={`${isShuffle ? 'text-indigo-400' : 'text-slate-400'} hover:text-white transition-colors`}
            >
                <Shuffle size={20} />
            </button>
            <button onClick={onPrev} className="text-white hover:text-indigo-400 transition-colors">
                <SkipBack size={32} fill="currentColor" />
            </button>
            <button 
                onClick={onTogglePlay}
                className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center hover:bg-indigo-400 shadow-lg hover:shadow-indigo-500/50 transition-all active:scale-95"
            >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>
            <button onClick={onNext} className="text-white hover:text-indigo-400 transition-colors">
                <SkipForward size={32} fill="currentColor" />
            </button>
             <button 
                onClick={toggleRepeat}
                className={`${repeatMode !== 'off' ? 'text-indigo-400' : 'text-slate-400'} hover:text-white transition-colors relative`}
            >
                {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="relative z-10 flex justify-between items-center px-8 pb-8">
          <button className="text-slate-400 hover:text-white flex flex-col items-center gap-1">
             <Volume2 size={20} />
             <span className="text-[10px]">音效</span>
          </button>
          <button className="text-slate-400 hover:text-white flex flex-col items-center gap-1">
              <ListMusic size={20} />
              <span className="text-[10px]">队列</span>
          </button>
      </div>
    </div>
  );
};

export default Playing;