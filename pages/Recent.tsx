import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, PlayCircle, Trash2 } from 'lucide-react';
import { Song } from '../types';
import { getListenRecords, dbClearPlayHistory } from '../utils/db';

interface RecentProps {
    onBack: () => void;
    onPlaySong: (song: Song) => void;
    onAddToQueue: (song: Song) => void;
}

const Recent: React.FC<RecentProps> = ({
    onBack,
    onPlaySong,
    onAddToQueue
}) => {
    const [records, setRecords] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        getListenRecords().then(list =>
            // 按时间倒序排列
            setRecords(list.sort((a, b) => b.ts - a.ts))
        );
    };

    const handleClearHistory = async () => {
        if (confirm('确定要清空所有播放记录吗？')) {
            await dbClearPlayHistory();
            setRecords([]);
            window.webapp?.toast?.('记录已清空');
        }
    };

    /** 分组逻辑：今天、昨天、更早 */
    const grouped = useMemo(() => {
        const groups: { [key: string]: any[] } = {
            '今天': [],
            '昨天': [],
            '更早': []
        };

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;

        records.forEach(r => {
            // 将 ts 转为日期字符串比较 (去掉前导0兼容处理)
            const d = new Date(r.ts);
            const dateStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

            if (dateStr === todayStr) {
                groups['今天'].push(r);
            } else if (dateStr === yesterdayStr) {
                groups['昨天'].push(r);
            } else {
                groups['更早'].push(r);
            }
        });

        // 过滤掉空组并按特定顺序返回
        return Object.entries(groups).filter(([_, list]) => list.length > 0);
    }, [records]);

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    };

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    };

    return (
        <div className="h-full  bg-slate-900  overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
            {/* 顶栏 */}
            <div className="sticky top-0 z-10  bg-slate-900 /95 backdrop-blur-md p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-lg font-bold text-white">最近播放</h1>
                </div>
                {records.length > 0 && (
                    <button onClick={handleClearHistory} className="p-2 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 size={20} />
                    </button>
                )}
            </div>

            <div className="p-4">
                {records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-slate-500">
                        <Clock size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">暂无播放记录</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {grouped.map(([label, list]) => (
                            <div key={label}>
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3 px-2">
                                    {label} <span className="text-slate-600 font-normal ml-1">({list.length})</span>
                                </h3>
                                <div className="space-y-1">
                                    {list.map((r, idx) => {
                                        const song: Song = {
                                            id: r.songId,
                                            title: r.title,
                                            artist: r.artist,
                                            coverUrl: r.coverUrl,
                                            url: '' // 需在播放时重新获取
                                        };

                                        return (
                                            <div
                                                key={`${r.id}_${idx}`}
                                                onClick={() => onPlaySong(song)}
                                                className="group flex items-center p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                                            >
                                                <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-3 bg-[#0f172a] shrink-0">
                                                    <img src={r.coverUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80'} className="w-full h-full object-cover" loading="lazy" />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <PlayCircle size={20} className="text-white" />
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm text-white font-medium truncate">{r.title}</h4>
                                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                                        {r.artist}
                                                        <span className="mx-1">·</span>
                                                        {label === '更早' ? formatDate(r.ts) : formatTime(r.ts)}
                                                        <span className="mx-1">·</span>
                                                        <span className="text-indigo-400/80">听了 {Math.ceil(r.playedSeconds / 60)} 分钟</span>
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Recent;