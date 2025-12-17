

import React from 'react';
import { Tab, Song } from '../types';
import { Home, Compass, Disc, FolderOpen, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  currentSong: Song | null; // 新增：接收当前歌曲
  isPlaying: boolean;       // 新增：用于控制旋转动画
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, currentSong, isPlaying }) => {
  const navItems = [
    { id: Tab.HOME, icon: Home, label: '首页' },
    { id: Tab.DISCOVER, icon: Compass, label: '发现' },
    { id: Tab.PLAYING, icon: Disc, label: '播放', special: true },
    { id: Tab.LOCAL, icon: FolderOpen, label: '本地' },
    { id: Tab.MINE, icon: User, label: '我的' },
  ];

  return (
    <div className="absolute bottom-0 w-full h-[70px] bg-[#0f172a]  flex justify-around items-end pb-2 z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        // --- 中间特殊的播放按钮 ---
        if (item.special) {
          return (
            <div
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="relative flex flex-col items-center justify-end w-16 cursor-pointer group"
            >
              {/* 悬浮的圆形区域 */}
              <div className={`
                        absolute -top-8 
                        w-14 h-14 
                        rounded-full 
                        border-[4px] border-[#0f172a] 
                        shadow-[0_0_15px_rgba(99,102,241,0.4)] 
                        transition-all duration-300
                        ${isActive ? 'scale-110 shadow-indigo-500/60' : 'hover:scale-105'}
                        ${currentSong ? ' bg-slate-900 ' : 'bg-indigo-600 p-3'}
                        overflow-hidden flex items-center justify-center
                    `}>
                {currentSong ? (
                  // 有歌曲时显示封面
                  <img
                    src={currentSong.coverUrl}
                    alt="cover"
                    className={`w-full h-full object-cover ${isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''}`}
                  />
                ) : (
                  // 无歌曲时显示默认图标
                  <Icon size={24} className="text-white animate-[spin_10s_linear_infinite]" />
                )}

                {/* 如果在播放，且不是封面模式，显示中间的小圆点装饰 */}
                {currentSong && (
                  <div className="absolute inset-0 m-auto w-3 h-3 bg-[#0f172a] rounded-full z-10 border border-slate-700" />
                )}
              </div>

              {/* 底部文字：显示歌名 或 "播放" */}
              <span className={`text-[10px] font-medium mt-7 max-w-full truncate px-1 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}>
                {currentSong ? currentSong.title : item.label}
              </span>
            </div>
          )
        }

        // --- 普通导航按钮 ---
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center w-14 h-full pt-1 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default BottomNav;