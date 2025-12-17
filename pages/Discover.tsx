
import React, { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp, Music, Clock, X, Loader2, Flame, Zap, Activity, Radio } from 'lucide-react';
import { SongItem } from '../components/SongItem';
import { Song } from '../types';
import { searchMusic, fetchSongDetail } from '../utils/api';

interface DiscoverProps {
  onPlaySong: (song: Song) => void;
  currentSong: Song | null;
  onNavigateChart: (title: string, gradient: string, chartId: string) => void;
}

const Discover: React.FC<DiscoverProps> = ({ onPlaySong, currentSong, onNavigateChart }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const searchRequestId = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem('search_history');
    if (saved) setHistory(JSON.parse(saved));

    const autoSearch = localStorage.getItem('temp_auto_search');
    if (autoSearch) {
      setSearchTerm(autoSearch);
      handleSearch(autoSearch);
      localStorage.removeItem('temp_auto_search');
    }
  }, []);

  const fetchDetailsSequentially = async (basicList: Song[], currentRequestId: number) => {
    const currentList = [...basicList];
    for (let i = 0; i < currentList.length; i++) {
      if (searchRequestId.current !== currentRequestId) return;
      try {
        const detail = await fetchSongDetail(currentList[i]);
        currentList[i] = detail;
        setSongs(prev => {
          if (searchRequestId.current !== currentRequestId) return prev;
          const newList = [...prev];
          newList[i] = detail;
          return newList;
        });
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { console.warn(e); }
    }
  };

  const handleSearch = async (term: string) => {
    const finalTerm = term || searchTerm;
    setSearchTerm(finalTerm);
    if (!finalTerm.trim()) return;

    searchRequestId.current += 1;
    const currentId = searchRequestId.current;

    const newHistory = [finalTerm, ...history.filter(h => h !== finalTerm)].slice(0, 8);
    setHistory(newHistory);
    localStorage.setItem('search_history', JSON.stringify(newHistory));

    setLoading(true);
    setHasSearched(true);
    setSongs([]);

    const basicResults = await searchMusic(finalTerm);

    if (searchRequestId.current === currentId) {
      setSongs(basicResults);
      setLoading(false);
      if (basicResults.length > 0) {
        fetchDetailsSequentially(basicResults, currentId);
      }
    }
  };

  const handleClearSearch = () => {
    searchRequestId.current += 1;
    setSearchTerm('');
    setSongs([]);
    setHasSearched(false);
  }

  // data-id="4" -> 流行榜
  const CHARTS = [
    { id: '1', name: '热搜榜', icon: Flame, gradient: 'from-pink-500 to-rose-600', sub: '全网最热' },
    { id: '2', name: '飙升榜', icon: Zap, gradient: 'from-purple-500 to-indigo-600', sub: '极速上升' },
    { id: '3', name: '新歌榜', icon: Activity, gradient: 'from-emerald-400 to-teal-600', sub: '每日更新' },
    { id: '4', name: '流行榜', icon: Radio, gradient: 'from-orange-400 to-amber-600', sub: '潮流前线' },
  ];

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      <div className="sticky top-0 z-10 bg-[#0f172a]/95  backdrop-blur-md p-6 pb-4 border-b border-white/5">
        <h1 className="text-2xl font-bold text-white mb-4">发现</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="搜索歌曲、歌手..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchTerm)}
            className="w-full bg-[#0f172a] text-white pl-10 pr-10 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder-slate-400"
          />

          {/* 优化后的加载指示器 */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {loading ? (
              <div className="flex items-center space-x-1.5">
                {/* 旋转图标 */}
                <Loader2 className="text-indigo-400 animate-spin" size={16} />
              </div>
            ) : searchTerm ? (
              <button
                onClick={handleClearSearch}
                className="text-slate-400 hover:text-white hover:bg-slate-700 p-1 rounded-full transition-all duration-200"
                aria-label="清除搜索"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-6 mt-4">
        {hasSearched ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-sm font-semibold text-slate-500 mb-3">搜索结果 ({songs.length})</h3>
            {songs.length > 0 ? (
              <div className="space-y-1">
                {songs.map((song, idx) => (
                  <SongItem
                    key={song.id}
                    index={idx}
                    song={song}
                    onClick={() => onPlaySong(song)}
                    isActive={currentSong?.id === song.id}
                  />
                ))}
              </div>
            ) : (
              !loading && <div className="text-center py-10 text-slate-500"><Music size={48} className="mx-auto mb-2 opacity-50" /><p>未找到相关歌曲</p></div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="text-indigo-400" size={18} />
                <h2 className="text-sm font-bold text-white">排行榜</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CHARTS.map((chart) => (
                  <div
                    key={chart.id}
                    onClick={() => onNavigateChart(chart.name, chart.gradient, chart.id)}
                    className={`bg-gradient-to-br ${chart.gradient} p-4 rounded-xl cursor-pointer hover:scale-[1.02] active:scale-95 transition-transform shadow-lg relative overflow-hidden`}
                  >
                    <chart.icon className="absolute right-2 bottom-2 text-white/20 w-16 h-16 -rotate-12" />
                    <h3 className="font-bold text-white text-lg relative ">{chart.name}</h3>
                    <p className="text-white/80 text-xs font-medium relative  mt-1">{chart.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {history.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-400 flex items-center gap-2"><Clock size={14} /> 历史搜索</h2>
                  <button onClick={() => { setHistory([]); localStorage.removeItem('search_history'); }} className="text-xs text-slate-500 hover:text-red-400">清空</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map(item => (
                    <span key={item} onClick={() => handleSearch(item)} className="px-3 py-1 bg-[#0f172a]/80 rounded-full text-xs text-slate-300 cursor-pointer hover:bg-slate-700">{item}</span>
                  ))}
                </div>
              </div>
            )}

            <div>

              <h2 className="text-sm font-bold text-slate-400 flex items-center gap-2"><Flame size={14} /> 热门搜素</h2>
              <div className="flex flex-wrap gap-3 mt-3">
                {['周杰伦', 'Taylor Swift', '陈奕迅', '林俊杰', '2024热歌'].map(tag => (
                  <span key={tag} onClick={() => handleSearch(tag)} className="px-4 py-2 bg-[#0f172a]/80 rounded-full text-sm text-slate-300 cursor-pointer hover:bg-indigo-600 hover:text-white transition-all">{tag}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Discover;