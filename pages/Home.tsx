import React from 'react';
import { Song, Playlist } from '../types';
import { Play, Heart, ChevronRight } from 'lucide-react';
import { MOCK_SONGS, MOCK_PLAYLISTS } from '../constants';

interface HomeProps {
  onPlaySong: (song: Song) => void;
  currentSong: Song | null;
}

const Home: React.FC<HomeProps> = ({ onPlaySong, currentSong }) => {
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      {/* Header */}
      <div className="p-6 pt-8">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          早上好
        </h1>
        <p className="text-slate-400 text-sm">欢迎回到 HillMusic</p>
      </div>

      {/* Featured/Banner */}
      <div className="px-6 mb-8">
        <div className="relative h-48 rounded-2xl overflow-hidden shadow-2xl group cursor-pointer">
          <img 
            src="https://picsum.photos/800/400?random=99" 
            alt="Featured" 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-6">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">最新发布</span>
            <h2 className="text-xl font-bold text-white mb-1">2024 夏日氛围</h2>
            <p className="text-slate-300 text-sm">为您精选的本周最热单曲。</p>
          </div>
        </div>
      </div>

      {/* Recommended Songs Horizontal Scroll */}
      <div className="mb-8">
        <div className="flex items-center justify-between px-6 mb-4">
          <h2 className="text-lg font-bold text-white">每日推荐</h2>
          <button className="text-xs text-indigo-400 flex items-center">
            查看全部 <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex overflow-x-auto no-scrollbar px-6 gap-4 pb-4">
          {MOCK_SONGS.map((song) => (
            <div 
              key={song.id} 
              className="flex-shrink-0 w-36 group cursor-pointer"
              onClick={() => onPlaySong(song)}
            >
              <div className="relative w-36 h-36 mb-3 rounded-xl overflow-hidden shadow-lg">
                <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="text-white fill-white" size={32} />
                </div>
              </div>
              <h3 className="text-sm font-medium text-white truncate">{song.title}</h3>
              <p className="text-xs text-slate-400 truncate">{song.artist}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Playlists Grid */}
      <div className="px-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">您的歌单</h2>
        <div className="grid grid-cols-2 gap-4">
          {MOCK_PLAYLISTS.map((playlist) => (
            <div key={playlist.id} className="bg-slate-800/50 p-3 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer">
              <div className="relative w-full aspect-square mb-3 rounded-lg overflow-hidden">
                <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                  {playlist.songCount}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-white truncate">{playlist.title}</h3>
              <p className="text-xs text-slate-400 truncate">{playlist.creator} 创建</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;