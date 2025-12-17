import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, BarChart3, CalendarDays, Music, Mic2, Clock, PieChart
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell, LineChart, Line, Pie, AreaChart, Area
} from 'recharts';
import { getListenRecords } from '../utils/db';
import { formatDuration } from '../utils/time';

interface ChartDetailProps {
    onBack?: () => void;
}

const StatisticDetail: React.FC<ChartDetailProps> = ({ onBack }) => {
    const [records, setRecords] = useState<any[]>([]);

    useEffect(() => {
        getListenRecords().then(setRecords);
    }, []);

    // --- 基础统计 ---
    const stats = useMemo(() => {
        const totalSeconds = records.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);

        // 统计最常听
        const artistMap: Record<string, number> = {};
        const songMap: Record<string, number> = {};

        records.forEach(r => {
            artistMap[r.artist] = (artistMap[r.artist] || 0) + r.playedSeconds;
            songMap[r.title] = (songMap[r.title] || 0) + r.playedSeconds;
        });

        const topArtist = Object.entries(artistMap).sort((a, b) => b[1] - a[1])[0] || ['暂无', 0];
        const topSong = Object.entries(songMap).sort((a, b) => b[1] - a[1])[0] || ['暂无', 0];

        return {
            totalTime: formatDuration(totalSeconds),
            totalCount: records.length,
            topArtist: topArtist[0],
            topSong: topSong[0]
        };
    }, [records]);

    // --- 图表数据：24小时分布 ---
    const dayData = useMemo(() => {
        const arr = Array.from({ length: 24 }, (_, h) => ({ label: `${h}点`, value: 0 }));
        records.forEach(r => {
            const h = new Date(r.ts).getHours();
            arr[h].value += Math.max(0, (r.playedSeconds || 0) / 60);
        });
        return arr.map(item => ({ ...item, value: Math.round(item.value) }));
    }, [records]);

    // --- 图表数据：周趋势 (最近7天) ---
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
        <div className="h-full bg-slate-950 overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md px-4 py-4 flex items-center gap-3 border-b border-white/5">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">听歌数据报告</h1>
            </div>

            <div className="p-5 space-y-6">

                {/* 概览卡片 */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-indigo-600/20 border border-indigo-500/20 p-4 rounded-2xl flex flex-col justify-between h-32">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white mb-2">
                            <Clock size={16} />
                        </div>
                        <div>
                            <p className="text-xs text-indigo-200/70">累计听歌</p>
                            <p className="text-xl font-bold text-white mt-0.5">{stats.totalTime}</p>
                        </div>
                    </div>
                    <div className="bg-emerald-600/20 border border-emerald-500/20 p-4 rounded-2xl flex flex-col justify-between h-32">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white mb-2">
                            <Music size={16} />
                        </div>
                        <div>
                            <p className="text-xs text-emerald-200/70">播放次数</p>
                            <p className="text-xl font-bold text-white mt-0.5">{stats.totalCount} <span className="text-xs font-normal opacity-60">次</span></p>
                        </div>
                    </div>
                </div>

                {/* 最爱统计 */}
                <div className=" bg-slate-900  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <PieChart size={16} className="text-orange-400" /> 听歌偏好
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#0f172a] flex items-center justify-center text-slate-400">
                                <Mic2 size={24} />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">最爱歌手</p>
                                <p className="text-white font-medium">{stats.topArtist}</p>
                            </div>
                        </div>
                        <div className="w-full h-[1px] bg-white/5" />
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#0f172a] flex items-center justify-center text-slate-400">
                                <Music size={24} />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">单曲循环最多</p>
                                <p className="text-white font-medium">{stats.topSong}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 24小时分布图 */}
                <div className=" bg-slate-900  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <Clock size={16} className="text-blue-400" /> 24小时活跃度
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
                                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                                />
                                <Bar dataKey="value" fill="url(#colorBar)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 周趋势图 */}
                <div className=" bg-slate-900  rounded-3xl p-5 border border-white/5">
                    <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <CalendarDays size={16} className="text-purple-400" /> 近7天听歌时长 (分钟)
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
                                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
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
