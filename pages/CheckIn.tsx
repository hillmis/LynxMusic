import React, { useState } from 'react';
import { ArrowLeft, Calendar, CheckCircle2, Circle, Flame, Gift, Coins, Trophy, Zap } from 'lucide-react';
import { Task } from '../types';

interface CheckInProps {
    onBack: () => void;
}

const MOCK_TASKS: Task[] = [
    { id: '1', title: '每日签到', reward: '+10 积分', completed: true },
    { id: '2', title: '收听满 30 分钟', reward: '+20 积分', completed: false },
    { id: '3', title: '浏览发现页', reward: '+5 积分', completed: true },
    { id: '4', title: '收藏 3 首新歌', reward: '+10 积分', completed: false },
];

const CheckIn: React.FC<CheckInProps> = ({ onBack }) => {
    // Fake heatmap data
    const days = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        level: Math.random() > 0.3 ? Math.floor(Math.random() * 4) + 1 : 0
    }));

    const [points, setPoints] = useState(2450);

    const getHeatColor = (level: number) => {
        switch (level) {
            case 0: return 'bg-slate-700/50';
            case 1: return 'bg-indigo-900/40';
            case 2: return 'bg-indigo-700/60';
            case 3: return 'bg-indigo-500';
            case 4: return 'bg-indigo-300';
            default: return 'bg-[#0f172a]';
        }
    };

    const handleSign = () => {
        window.webapp?.toast?.('签到成功 +10积分');
        setPoints(p => p + 10);
    };

    return (
        <div className="h-full overflow-y-auto no-scrollbar bg-slate-950 pb-20 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md p-4 flex items-center gap-4 border-b border-white/5">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-white" />
                </button>
                <h1 className="text-lg font-bold text-white">福利中心</h1>
            </div>

            <div className="p-5">
                {/* Points Card */}
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-6 mb-8 shadow-xl relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 opacity-20">
                        <Gift size={140} className="text-white rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 opacity-90">
                            <Coins size={16} className="text-yellow-300" />
                            <span className="text-indigo-100 text-sm font-medium">我的积分</span>
                        </div>
                        <h2 className="text-4xl font-black text-white mb-6 tracking-tight">{points.toLocaleString()}</h2>

                        <div className="flex gap-3">
                            <button className="flex-1 bg-white text-indigo-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-2">
                                <Gift size={16} /> 积分兑换
                            </button>
                            <button className="flex-1 bg-indigo-800/50 text-white border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-800 active:scale-95 transition-all flex items-center justify-center gap-2">
                                <Trophy size={16} /> 排行榜
                            </button>
                        </div>
                    </div>
                </div>

                {/* Heatmap Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-2">
                            <Flame className="text-orange-500" size={20} />
                            <h3 className="text-white font-bold">听歌活跃度</h3>
                        </div>
                        <span className="text-xs text-slate-500">最近30天</span>
                    </div>
                    <div className=" bg-slate-900 /50 p-5 rounded-2xl border border-white/5">
                        <div className="grid grid-cols-6 gap-2">
                            {days.map((d) => (
                                <div
                                    key={d.day}
                                    className={`aspect-square rounded-md ${getHeatColor(d.level)} transition-all hover:scale-110 cursor-pointer relative group`}
                                >
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end items-center gap-2 mt-4 text-[10px] text-slate-500">
                            <span>少</span>
                            <div className="w-2 h-2 bg-slate-700/50 rounded-sm"></div>
                            <div className="w-2 h-2 bg-indigo-900/40 rounded-sm"></div>
                            <div className="w-2 h-2 bg-indigo-500 rounded-sm"></div>
                            <div className="w-2 h-2 bg-indigo-300 rounded-sm"></div>
                            <span>多</span>
                        </div>
                    </div>
                </div>

                {/* Tasks List */}
                <div>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <Calendar className="text-blue-400" size={20} />
                        <h3 className="text-white font-bold">今日任务</h3>
                    </div>
                    <div className="space-y-3">
                        {MOCK_TASKS.map(task => (
                            <div key={task.id} className="flex items-center justify-between  bg-slate-900 /40 p-4 rounded-2xl border border-white/5 hover:bg-[#0f172a]/40 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${task.completed ? 'bg-green-500/10 text-green-500' : 'bg-[#0f172a] text-slate-500'}`}>
                                        {task.completed ? <CheckCircle2 size={20} /> : <Zap size={20} />}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${task.completed ? 'text-slate-500 line-through' : 'text-white'}`}>
                                            {task.title}
                                        </p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <Coins size={10} className="text-yellow-500" />
                                            <p className="text-xs text-yellow-500 font-medium">{task.reward}</p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    disabled={task.completed}
                                    onClick={task.title === '每日签到' ? handleSign : undefined}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${task.completed
                                        ? 'bg-[#0f172a] text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
                                        }`}
                                >
                                    {task.completed ? '已完成' : '去完成'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckIn;