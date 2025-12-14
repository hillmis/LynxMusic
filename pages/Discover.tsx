import React, { useState } from 'react';
import { Search, TrendingUp, Hash, Music } from 'lucide-react';
import { MOCK_SONGS } from '../constants';
import { SongItem } from '../components/SongItem';
import { Song } from '../types';

interface DiscoverProps {
  onPlaySong: (song: Song) => void;
  currentSong: Song | null;
}

const Discover: React.FC<DiscoverProps> = ({ onPlaySong, currentSong }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSongs = searchTerm 
    ? MOCK_SONGS.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.artist.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur-md p-6 pb-4">
        <h1 className="text-2xl font-bold text-white mb-4">发现</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="搜索歌曲、歌手、歌词..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder-slate-500"
          />
        </div>
      </div>

      <div className="px-6">
        {searchTerm ? (
          /* Search Results */
          <div className="mt-2">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">搜索结果</h3>
            {filteredSongs.length > 0 ? (
              filteredSongs.map((song, idx) => (
                <SongItem 
                  key={song.id} 
                  index={idx} 
                  song={song} 
                  onClick={() => onPlaySong(song)}
                  isActive={currentSong?.id === song.id}
                />
              ))
            ) : (
              <div className="text-center py-10 text-slate-500">
                <Music size={48} className="mx-auto mb-2 opacity-50" />
                <p>未找到 "{searchTerm}" 相关歌曲</p>
              </div>
            )}
          </div>
        ) : (
          /* Default Discover View */
          <>
            {/* Hot Tags */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="text-indigo-400" size={18} />
                <h2 className="text-lg font-bold text-white">热门搜索</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {['#流行金曲', '#华语经典', '#运动节奏', '#爵士氛围', '#助眠', '#2024派对'].map(tag => (
                  <span key={tag} className="px-4 py-2 bg-slate-800 rounded-full text-sm text-slate-300 cursor-pointer hover:bg-indigo-600 hover:text-white transition-colors">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Charts Preview */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">全球榜单</h2>
              <div className="bg-gradient-to-r from-pink-600 to-rose-600 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:brightness-110 transition-all">
                <div>
                  <h3 className="font-bold text-white text-lg">全球 Top 50</h3>
                  <p className="text-pink-200 text-xs">每日更新</p>
                </div>
                <Hash className="text-white/50" size={32} />
              </div>
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:brightness-110 transition-all">
                 <div>
                  <h3 className="font-bold text-white text-lg">飙升榜 Top 50</h3>
                  <p className="text-blue-200 text-xs">正在流行</p>
                </div>
                <TrendingUp className="text-white/50" size={32} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Discover;