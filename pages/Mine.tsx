import React from 'react';
import { User, Settings, Heart, Clock, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { LISTENING_STATS, MOCK_PLAYLISTS } from '../constants';

const Mine: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      {/* Profile Header */}
      <div className="bg-gradient-to-b from-indigo-900/50 to-slate-900 p-6 pt-10">
        <div className="flex justify-between items-start mb-6">
           <div className="w-20 h-20 rounded-full bg-slate-700 p-1 ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900">
             <div className="w-full h-full rounded-full bg-indigo-600 flex items-center justify-center overflow-hidden">
               <User size={40} className="text-white" />
             </div>
           </div>
           <button className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white">
             <Settings size={20} />
           </button>
        </div>
        <h1 className="text-2xl font-bold text-white">Hill 用户</h1>
        <div className="flex gap-4 mt-2 text-sm text-slate-400">
          <span><strong className="text-white">12</strong> 歌单</span>
          <span><strong className="text-white">248</strong> 关注</span>
          <span><strong className="text-white">56</strong> 粉丝</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-around px-6 py-4 border-b border-slate-800">
        <div className="flex flex-col items-center gap-1 cursor-pointer group">
          <div className="p-3 bg-red-500/10 rounded-full text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
            <Heart size={20} />
          </div>
          <span className="text-xs text-slate-400">我喜欢的</span>
        </div>
         <div className="flex flex-col items-center gap-1 cursor-pointer group">
          <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all">
            <Clock size={20} />
          </div>
          <span className="text-xs text-slate-400">播放历史</span>
        </div>
      </div>

      {/* Statistics */}
      <div className="p-6">
        <h2 className="text-lg font-bold text-white mb-4">听歌时长 (分钟)</h2>
        <div className="h-48 w-full bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={LISTENING_STATS}>
              <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
                {LISTENING_STATS.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 5 ? '#6366f1' : '#475569'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* My Playlists List */}
      <div className="px-6 pb-6">
        <h2 className="text-lg font-bold text-white mb-4">创建的歌单</h2>
        <div className="space-y-3">
          {MOCK_PLAYLISTS.map(playlist => (
            <div key={playlist.id} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl hover:bg-slate-800 cursor-pointer">
              <div className="flex items-center">
                 <img src={playlist.coverUrl} className="w-12 h-12 rounded bg-slate-700 object-cover" alt="cover"/>
                 <div className="ml-3">
                   <h3 className="text-white text-sm font-medium">{playlist.title}</h3>
                   <p className="text-slate-500 text-xs">{playlist.songCount} 首</p>
                 </div>
              </div>
              <ChevronRight size={16} className="text-slate-600" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Mine;