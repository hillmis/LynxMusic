import React from 'react';
import { Tab } from '../types';
import { Home, Compass, Disc, FolderOpen, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: Tab.HOME, icon: Home, label: '首页' },
    { id: Tab.DISCOVER, icon: Compass, label: '发现' },
    { id: Tab.PLAYING, icon: Disc, label: '播放', special: true }, 
    { id: Tab.LOCAL, icon: FolderOpen, label: '本地' },
    { id: Tab.MINE, icon: User, label: '我的' },
  ];

  return (
    <div className="absolute bottom-0 w-full h-[70px] bg-[#0f172a] border-t border-slate-800 flex justify-around items-center px-2 pb-2 z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        
        // The Playing icon in the center usually triggers the player view
        // But here we use it as a tab or a trigger. 
        if (item.special) {
             return (
                <div 
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className="relative -top-5 bg-indigo-600 rounded-full p-3 shadow-[0_0_15px_rgba(99,102,241,0.5)] cursor-pointer hover:bg-indigo-500 transition-all border-4 border-[#0f172a]"
                >
                    <Icon size={24} className="text-white animate-[spin_8s_linear_infinite]" />
                </div>
             )
        }

        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center w-14 h-full pt-2 transition-colors duration-200 ${
              isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
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