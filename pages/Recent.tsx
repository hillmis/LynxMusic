import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, PlayCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Song } from '../types';
import { getListenRecords, dbClearPlayHistory, ListenRecord, getTotalListenSeconds } from '../utils/db';
import { formatDuration } from '../utils/time';
import { safeToast } from '../utils/fileSystem';



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
    const [records, setRecords] = useState<ListenRecord[]>([]);
    const [totalSeconds, setTotalSeconds] = useState(0);
    const [todaySeconds, setTodaySeconds] = useState(0);
    const [songCount, setSongCount] = useState(0);
    const [playCount, setPlayCount] = useState(0);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const getDayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const todayKey = useMemo(() => getDayKey(Date.now()), []);

    useEffect(() => {
        loadData();
        window.addEventListener('listen-history-updated', loadData);
        return () => window.removeEventListener('listen-history-updated', loadData);
    }, []);

    const loadData = () => {
        // 可视列表使用清空阈值，统计使用完整数据
        getListenRecords().then((visible) => {
            setRecords(visible);
            setTotalSeconds(getTotalListenSeconds());
        });
        getListenRecords({ includeCleared: true }).then((full) => {
            setPlayCount(full.length);
            setSongCount(new Set(full.map((r) => r.songId).filter(Boolean)).size);
            setTotalSeconds(getTotalListenSeconds());
            const todayTotal = full.reduce((acc, cur) => {
                const key = cur.dayKey || getDayKey(cur.ts);
                return key === todayKey ? acc + (cur.playedSeconds || 0) : acc;
            }, 0);
            setTodaySeconds(todayTotal);
        });
    };

    const handleClearHistory = async () => {
        if (confirm('确定要清空所有播放记录吗？系统会保留累计听歌时长并覆盖本地播放记录备份。')) {
            await dbClearPlayHistory();
            setRecords([]);
            // 清空列表后仍保留总统计
            getListenRecords({ includeCleared: true }).then((full) => {
                setPlayCount(full.length);
                setSongCount(new Set(full.map((r) => r.songId).filter(Boolean)).size);
            });
            setTotalSeconds(getTotalListenSeconds());
            safeToast('记录已清空，播放时长已保留');
        }
    };

    const totalDurationText = useMemo(
        () => formatDuration(totalSeconds, { keepSeconds: true }),
        [totalSeconds]
    );
    const todayDurationText = useMemo(
        () => formatDuration(todaySeconds, { keepSeconds: true }),
        [todaySeconds]
    );
    /** 分组逻辑：今天、昨天、更早 */
    const grouped = useMemo(() => {
        const groups: { [key: string]: ListenRecord[] } = {
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

        return Object.entries(groups).filter(([_, list]) => list.length > 0);
    }, [records]);

    useEffect(() => {
        setExpandedGroups(prev => {
            const next = { ...prev };
            grouped.forEach(([label]) => {
                if (next[label] === undefined) next[label] = true;
            });
            return next;
        });
    }, [grouped]);

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
        <div className="h-full bg-[#121212] overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
            {/* 顶栏 */}
            <div className="sticky top-0 z-10 bg-[#121212]/95 backdrop-blur-md p-4 border-b border-white/5 flex items-center justify-between">
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

            <div className="px-4 pt-4">
                <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
                    <div className="space-y-2">
                        <div>
                            <p className="text-xs text-slate-500">今日听歌时长</p>
                            <p className="text-lg font-bold text-white mt-0.5">{todayDurationText}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">总累计听歌时长</p>
                            <p className="text-lg font-bold text-white mt-0.5">{totalDurationText}</p>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                        <p className="text-xs text-slate-500">播放歌曲数</p>
                        <p className="text-lg font-bold text-white mt-0.5">{songCount}</p>
                          <p className="text-xs text-slate-500">播放次数</p>
                        <p className="text-lg font-bold text-white mt-0.5">{playCount}</p>
                    </div>
                </div>
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
                                <button
                                    type="button"
                                    onClick={() => setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))}
                                    className="w-full flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3 px-2"
                                >
                                    <span>
                                        {label} <span className="text-slate-600 font-normal ml-1">({list.length})</span>
                                    </span>
                                    {expandedGroups[label] ? (
                                        <ChevronUp size={14} className="text-slate-500" />
                                    ) : (
                                        <ChevronDown size={14} className="text-slate-500" />
                                    )}
                                </button>
                                {expandedGroups[label] && (
                                    <div className="space-y-1">
                                        {list.map((r, idx) => {
                                            const song: Song = {
                                                id: r.songId,
                                                title: r.title,
                                                artist: r.artist,
                                                coverUrl: r.coverUrl,
                                                url: '' // 需要在播放时重新获取
                                            };

                                            return (
                                                <div
                                                    key={`${r.id}_${idx}`}
                                                    onClick={() => onPlaySong(song)}
                                                    className="group flex items-center p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                                                >
                                                    <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-3 bg-[#121212] shrink-0">
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
                                                            <span className="text-indigo-400/80">听了 {formatDuration(r.playedSeconds, { keepSeconds: true })}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Recent;
