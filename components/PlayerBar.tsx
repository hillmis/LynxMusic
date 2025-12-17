import React from 'react';
import { Song } from '../types';
import { Play, Pause, SkipForward, Heart } from 'lucide-react';

interface PlayerBarProps {
  song: Song;
  isPlaying: boolean;
  onTogglePlay: (e: React.MouseEvent) => void;
  onExpand: () => void;
}

const PlayerBar: React.FC<PlayerBarProps> = ({ song, isPlaying, onTogglePlay, onExpand }) => {
  return (
    <div
      onClick={onExpand}
      className="absolute bottom-[80px] left-4 right-4 h-16 bg-[#1e293b]/90 backdrop-blur-md rounded-2xl flex items-center px-4 shadow-xl border border-white/5 cursor-pointer z-40 transform hover:scale-[1.02] transition-transform"
    >
      {/* Rotating Thumb */}
      <div className={`w-10 h-10 rounded-full overflow-hidden border border-slate-600 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
        <img src={song.coverUrl} alt="cover" className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 ml-3 overflow-hidden">
        <h4 className="text-white text-sm font-semibold truncate">{song.title}</h4>
        <p className="text-slate-400 text-xs truncate">{song.artist}</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="text-slate-400 hover:text-red-500">
          <Heart size={20} />
        </button>
        <button
          onClick={onTogglePlay}
          className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-centertext-whitehover:bg-white/10"
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>

      {/* Progress Line (Fake) */}
      <div className="absolute bottom-0 left-4 right-4 h-[2px] bg-slate-700/50 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 w-1/3 animate-pulse"></div>
      </div>
    </div>
  );
};

export default PlayerBar;