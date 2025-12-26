
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Share2, MoreHorizontal, Crown, Loader2, Search } from 'lucide-react';
import { Song } from '../types';
import { getTopCharts } from '../utils/api';

interface ChartDetailProps {
    title: string;
    gradient: string;
    chartId: string;
    onBack: () => void;
    // 榜单歌曲点击时，实际上是进行搜索，而不是直接播放
    onSearch: (keyword: string) => void;
    currentSong: Song | null;
}

const ChartDetail: React.FC<ChartDetailProps> = ({ title, gradient, chartId, onBack, onSearch, currentSong }) => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadChart = async () => {
            setLoading(true);
            const data = await getTopCharts(chartId);
            if (isMounted) {
                setSongs(data);
                setLoading(false);
            }
        };
        loadChart();
        return () => { isMounted = false; };
    }, [chartId]);

    const getRankStyle = (index: number) => {
        switch (index) {
            case 0: return 'text-yellow-400 font-black text-2xl drop-shadow-md';
            case 1: return 'text-slate-300 font-black text-xl';
            case 2: return 'text-orange-400 font-black text-xl';
            default: return 'text-slate-500 font-medium text-sm';
        }
    };

    return (
        <div className="h-full overflow-y-auto no-scrollbar  bg-[#121212]  pb-10 animate-in slide-in-from-right duration-300 relative">
            {/* Header */}
            <div className={`relative w-full h-64 bg-gradient-to-br ${gradient} p-6 flex flex-col justify-between transition-all duration-500`}>
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft size={24} className="text-white" />
                    </button>
                    <div className="flex gap-2">
                        <button className="p-2 hover:bg-white/10 rounded-full text-white"><Share2 size={20} /></button>
                        <button className="p-2 hover:bg-white/10 rounded-full text-white"><MoreHorizontal size={20} /></button>
                    </div>
                </div>

                <div className="z-10 mt-8">
                    <div className="flex items-center gap-2 mb-2 opacity-80">
                        <span className="text-xs font-bold border border-white/30 px-2 py-0.5 rounded text-white">官方动态</span>
                        <span className="text-xs text-white/80">实时更新</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight italic flex items-center gap-3">
                        {title}
                        <Crown size={32} className="text-white/20 rotate-12" />
                    </h1>
                    <p className="text-white/60 text-xs mt-2 font-medium">LynxMusic 大数据算法推荐</p>
                </div>

                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none overflow-hidden">
                    <h1 className="text-9xl font-black text-white -mb-8 -mr-8 italic tracking-tighter">RANK</h1>
                </div>
            </div>

            {/* List */}
            <div className=" bg-[#121212]  -mt-6 rounded-t-3xl relative z-20 px-4 pt-6 min-h-[50vh]">
                <div className="flex items-center justify-between mb-4 px-2">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Search size={12} /> 点击歌曲搜索播放资源
                    </span>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs text-slate-500">正在获取榜单数据...</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {songs.map((song, idx) => (
                            <div
                                key={song.id}
                                // [核心] 榜单歌曲点击时，组合 歌名+歌手 进行搜索
                                onClick={() => onSearch(`${song.title} ${song.artist}`)}
                                className={`flex items-center py-3 px-2 rounded-xl transition-colors cursor-pointer hover:bg-[#121212]/50 active:scale-[0.99]`}
                            >
                                {/* Rank */}
                                <div className="w-8 text-center flex flex-col items-center justify-center mr-3 gap-1">
                                    <span className={`${getRankStyle(idx)} font-serif italic`}>{idx + 1}</span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-medium truncate ${currentSong?.title === song.title ? 'text-indigo-400' : 'text-white'}`}>
                                        {song.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                        {song.artist}
                                        {idx < 3 && <span className="ml-2 px-1.5 py-0.5 rounded-[3px] bg-red-500/20 text-red-500 text-[9px]">HOT</span>}
                                    </p>
                                </div>

                                <button className="p-2 text-slate-500 hover:text-white">
                                    <Search size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && songs.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-xs">暂无榜单数据</div>
                )}

                {!loading && songs.length > 0 && (
                    <div className="text-center py-8 text-xs text-slate-600">— 到底了 —</div>
                )}
            </div>
        </div>
    );
};

export default ChartDetail;