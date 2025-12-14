import React from 'react';
import { Song } from '../types';
import { Play, MoreVertical } from 'lucide-react';

interface SongItemProps {
  song: Song;
  index: number;
  onClick: () => void;
  isActive: boolean;
}

export const SongItem: React.FC<SongItemProps> = ({ song, index, onClick, isActive }) => {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center p-3 mb-2 rounded-xl transition-all cursor-pointer ${
        isActive ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-slate-800'
      }`}
    >
      <div className="w-8 text-center text-slate-500 text-sm font-medium mr-3">
        {isActive ? <Play size={14} className="text-indigo-400 fill-indigo-400 mx-auto animate-pulse" /> : index + 1}
      </div>
      <img 
        src={song.coverUrl} 
        alt={song.title} 
        className="w-12 h-12 rounded-lg object-cover shadow-sm" 
      />
      <div className="flex-1 ml-4 overflow-hidden">
        <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-300' : 'text-slate-100'}`}>
          {song.title}
        </h3>
        <p className="text-xs text-slate-400 truncate">{song.artist} • {song.album}</p>
      </div>
      <button className="p-2 text-slate-400 hover:text-white">
        <MoreVertical size={16} />
      </button>
    </div>
  );
};