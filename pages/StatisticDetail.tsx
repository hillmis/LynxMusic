import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, BarChart3, CalendarDays, Music, Mic2, Clock, PieChart
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell, LineChart, Line, Pie, AreaChart, Area
} from 'recharts';
import { getListenRecords, getTotalListenSeconds } from '../utils/db';
import { formatDuration } from '../utils/time';

interface ChartDetailProps {
    onBack?: () => void;
}

const StatisticDetail: React.FC<ChartDetailProps> = ({ onBack }) => {
    const [records, setRecords] = useState<any[]>([]);
    const [totalSecondsAll, setTotalSecondsAll] = useState(0);
    const getDayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const todayKey = useMemo(() => getDayKey(Date.now()), []);
    const monthStartMs = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 29);
        return d.getTime();
    }, []);

    useEffect(() => {
        const load = () => getListenRecords({ includeCleared: true }).then((list) => {
            setRecords(list);
            setTotalSecondsAll(getTotalListenSeconds());
        });
        load();
        window.addEventListener('listen-history-updated', load);
        return () => window.removeEventListener('listen-history-updated', load);
    }, []);

    // --- 基础统计 ---
    const stats = useMemo(() => {
        const totalSeconds = totalSecondsAll || records.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
        let todaySeconds = 0;
        let monthSeconds = 0;
        let todayCount = 0;
        let monthCount = 0;

        const artistDurationMap: Record<string, number> = {};
        const songDurationMap: Record<string, number> = {};
        const artistPlayTimes: Record<string, number> = {};
        const songPlayTimes: Record<string, number> = {};
        const artistSet = new Set<string>();
        const songSet = new Set<string>();

        records.forEach(r => {
            const sec = Math.max(0, r.playedSeconds || 0);
            const ts = r.ts || 0;
            const key = r.dayKey || getDayKey(ts);
            const artist = r.artist || '未知';
            const song = r.title || '未知';
            if (key === todayKey) {
                todaySeconds += sec;
                todayCount += 1;
            }
            if (ts >= monthStartMs) {
                monthSeconds += sec;
                monthCount += 1;
            }
            artistSet.add(artist);
            songSet.add(song);
            artistDurationMap[artist] = (artistDurationMap[artist] || 0) + sec;
            songDurationMap[song] = (songDurationMap[song] || 0) + sec;
            artistPlayTimes[artist] = (artistPlayTimes[artist] || 0) + 1;
            songPlayTimes[song] = (songPlayTimes[song] || 0) + 1;
        });

        const pickTop = (map: Record<string, number>) => Object.entries(map).sort((a, b) => b[1] - a[1])[0] || ['暂无', 0];
        const topArtist = pickTop(artistPlayTimes);
        const topSong = pickTop(songPlayTimes);

        return {
            totalTime: formatDuration(totalSeconds, { keepSeconds: true }),
            totalCount: records.length,
            monthTime: formatDuration(monthSeconds, { keepSeconds: true }),
            monthCount,
            todayTime: formatDuration(todaySeconds, { keepSeconds: true }),
            todayCount,
            topArtistName: topArtist[0],
            topArtistPlayTimes: topArtist[1],
            topSongName: topSong[0],
            topSongPlayTimes: topSong[1],
            songCount: songSet.size,
            artistCount: artistSet.size
        };
    }, [records, totalSecondsAll, todayKey, monthStartMs]);

    // --- 图表数据24小时分布 ---
    const dayData = useMemo(() => {
        const arr = Array.from({ length: 24 }, (_, h) => ({ label: `${h}点`, value: 0 }));
        records.forEach(r => {
            const h = new Date(r.ts).getHours();
            arr[h].value += Math.max(0, (r.playedSeconds || 0) / 60);
        });
        return arr.map(item => ({ ...item, value: Math.round(item.value) }));
    }, [records]);

    // --- 图表数据：周趋势 ---
    const weekTrend = useMemo(() => {
        const map: Record<string, number> = {};
        const now = new Date();
        const days = [];

        // 生成最近7天的key
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            days.push(key);
            map[key] = 0;
        }

        records.forEach(r => {
            const d = new Date(r.ts);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (map[key] !== undefined) {
                map[key] += r.playedSeconds / 60; // 分钟
            }
        });

        return days.map(day => ({
            day,
            minutes: Math.round(map[day])
        }));
    }, [records]);

    return (
        <div className="h-full bg-neutral-950 overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md px-4 py-4 flex items-center gap-3 border-b border-white/5">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">听歌数据报告</h1>
            </div>

            <div className="p-5 space-y-6">

                {/* 概览卡片 */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800/40 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                        
                        <div>
                            <p className="text-xs text-indigo-200/70">今日累计</p>
                            <p className="text-m font-bold text-white mt-0.5">{stats.todayTime}</p>
                            
                        </div>
                    </div>
                    <div className="bg-slate-800/40 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                       
                        <div>
                            <p className="text-xs text-emerald-200/70">近30天</p>
                            <p className="text-m font-bold text-white mt-0.5">{stats.monthTime}</p>
                           
                        </div>
                    </div>
                    <div className="bg-slate-800/40 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                       
                        <div>
                            <p className="text-xs text-indigo-200/70">总累计</p>
                            <p className="text-m font-bold text-white mt-0.5">{stats.totalTime}</p>
                        
                        </div>
                    </div>
                </div>

                {/* 播放与覆盖统计 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  
                    <div className="bg-neutral-900 border border-white/5 p-4 rounded-2xl h-24 flex flex-col justify-between">
                        <div className="text-xs text-slate-500">播放歌曲数</div>
                        <div className="text-xl font-bold text-white">{stats.songCount}</div>        
                    </div>
                    <div className="bg-neutral-900 border border-white/5 p-4 rounded-2xl h-24 flex flex-col justify-between">
                        <div className="text-xs text-slate-500">播放歌手</div>
                        <div className="text-xl font-bold text-white">{stats.artistCount}</div>
                    </div>
                </div>

                {/* 最爱统�?*/}
                <div className=" bg-slate-800/40  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <PieChart size={16} className="text-orange-400" /> 听歌偏好
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#0b0b0b] flex items-center justify-center text-slate-400">
                                <Mic2 size={24} />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">最爱歌手（{stats.topArtistPlayTimes} 次）</p>
                                <p className="text-white font-medium">{stats.topArtistName}</p>
                            </div>
                        </div>
                        <div className="w-full h-[1px] bg-white/5" />
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#0b0b0b] flex items-center justify-center text-slate-400">
                                <Music size={24} />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">单曲循环最多的歌曲（{stats.topSongPlayTimes} 次）</p>
                                <p className="text-white font-medium">{stats.topSongName}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 24小时分布*/}
                <div className=" bg-neutral-900  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <Clock size={16} className="text-blue-400" /> 24小时
                    </h2>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dayData}>
                                <defs>
                                    <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={3} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ background: '#0b0b0b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                                />
                                <Bar dataKey="value" fill="url(#colorBar)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 周趋势图 */}
                <div className=" bg-neutral-900  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <CalendarDays size={16} className="text-purple-400" /> 周趋势
                    </h2>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={weekTrend}>
                                <defs>
                                    <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0b0b0b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="minutes" stroke="#8b5cf6" strokeWidth={3} fill="url(#colorArea)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default StatisticDetail;


