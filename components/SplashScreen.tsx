/*
 * @Author: Wind
 * @Date: 2025-12-22 22:43:06
 */
import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  finishLoading: boolean; // 父组件通知是否可以结束
}

const SplashScreen: React.FC<SplashScreenProps> = ({ finishLoading }) => {
  // 控制组件是否在 DOM 中渲染
  const [shouldRender, setShouldRender] = useState(true);
  // 控制是否开始执行退场动画
  const [isFading, setIsFading] = useState(false);
const [quote, setQuote] = useState('像山猫一样自由，无边界的音乐体验。');

useEffect(() => {
    // 尝试获取一言，防止脚本未加载导致报错
    const sys = (window as any).DxxSystem;
    if (sys && typeof sys.getHitokoto === 'function') {
        setQuote(sys.getHitokoto());
    }
}, []);

  useEffect(() => {
    if (finishLoading) {
      // 1. 触发 CSS 动画状态
      setIsFading(true);
      
      // 2. 等待动画结束后（这里设为 700ms），彻底从 DOM 移除
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 700); 
      return () => clearTimeout(timer);
    }
  }, [finishLoading]);

  if (!shouldRender) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-center 
        bg-[#121212] overflow-hidden select-none
        transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]
        ${isFading ? 'opacity-0 scale-110 blur-md pointer-events-none' : 'opacity-100 scale-100 blur-0'}
      `}
    >
      {/* --- 背景氛围光效 (静态) --- */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-indigo-600/10 rounded-full blur-[100px]" />
      
      <div className="relative z-10 flex flex-col items-center">
        {/* --- Logo 容器 --- */}
        <div className="relative mb-10 group"> {/* 增加了 mb-8 到 mb-10，增加间距 */}
          {/* Logo背后的呼吸光晕 */}
          <div className="absolute inset-0 bg-indigo-500/30 blur-2xl rounded-full animate-pulse" />
          
          {/* 核心 Logo: favicon.png */}
          {/* 修改点 1：容器尺寸变大 (移动端 w-48, 桌面端 w-64) */}
          <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-3xl flex items-center justify-center shadow-2xl">
             <img 
                src="logo.png" 
                alt="Logo" 
                className="w-full h-full object-contain drop-shadow-lg p-2"
             />
          </div>
        </div>

        {/* --- 标题 --- */}
        <div className="text-center space-y-2">
            {/* 修改点 3：标题字号也稍微调大一点，以匹配更大的 Logo */}
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-widest font-sans drop-shadow-lg">
            LYNX<span className="text-indigo-400">MUSIC</span>
            </h1>
        </div>
        
        {/* --- 底部加载条 --- */}
        <div className="absolute bottom-[-80px] md:bottom-[-160px] flex flex-col items-center gap-3">
             {/* 简单的加载动画圆点 */}
          <div className="flex items-center gap-2">
    <style>{`
        @keyframes bounce-large {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }
    `}</style>
    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-[bounce-large_1s_infinite_0ms]"></span>
    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-[bounce-large_1s_infinite_200ms]"></span>
    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-[bounce-large_1s_infinite_400ms]"></span>
</div>
        </div>
      </div>

      {/* 底部版权 */}
      <div className="absolute bottom-7 w-full px-8 flex justify-center">
        <p className="text-slate-700 text-[10px] font-mono tracking-wider text-center max-w-md opacity-70 truncate">
            {quote}
        </p>
    </div>
    </div>
  );
};

export default SplashScreen;