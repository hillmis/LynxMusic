/*
 * @Author: Wind
 * @Date: 2025-12-14 14:14:46
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tab, Song } from '../types';
import { Home, Compass, Disc, FolderOpen, User } from 'lucide-react';
interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  currentSong: Song | null;
  isPlaying: boolean;
  panelRect?: { left: number; top: number; width: number; height: number };
  isSplitDragging?: boolean;
}

const NAV_HEIGHT = 70;
const BUBBLE_SIZE = 56; // px
const EDGE_PADDING = 12;
const DRAG_HOLD_MS = 200;

const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  currentSong,
  isPlaying,
  panelRect,
  isSplitDragging,
}) => {
  const computeDefaultPos = () => {
    const hasPanel = !!panelRect;
    const w = hasPanel
      ? panelRect!.width
      : typeof window !== 'undefined'
        ? window.innerWidth
        : 360;
    const h = hasPanel
      ? panelRect!.height
      : typeof window !== 'undefined'
        ? window.innerHeight
        : 640;
    const left = hasPanel ? panelRect!.left : 0;
    const top = hasPanel ? panelRect!.top : 0;

    return {
      x: left + w / 2,
      y: top + h - NAV_HEIGHT / 2 - 30,
    };
  };

  const [defaultPos, setDefaultPos] = useState(computeDefaultPos);
  const [isDragging, setIsDragging] = useState(false);
  const [bubblePos, setBubblePos] = useState(defaultPos);
  const holdTimerRef = useRef<number | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);

  const navItems = useMemo(() => ([
    { id: Tab.HOME, icon: Home, label: '首页' },
    { id: Tab.DISCOVER, icon: Compass, label: '发现' },
    { id: Tab.PLAYING, icon: Disc, label: '播放', special: true },
    { id: Tab.LOCAL, icon: FolderOpen, label: '本地' },
    { id: Tab.MINE, icon: User, label: '我的' },
  ]), []);

  const snapToEdge = (pos: { x: number; y: number }) => {
    const hasPanel = !!panelRect;
    const w = hasPanel ? panelRect!.width : window.innerWidth;
    const h = hasPanel ? panelRect!.height : window.innerHeight;
    const left = hasPanel ? panelRect!.left : 0;
    const top = hasPanel ? panelRect!.top : 0;
    const navTop = top + h - NAV_HEIGHT;

    if (pos.y >= navTop) {
      return defaultPos;
    }

    const x = pos.x < left + w / 2
      ? left + EDGE_PADDING + BUBBLE_SIZE / 2
      : left + w - EDGE_PADDING - BUBBLE_SIZE / 2;

    const maxY = top + h - NAV_HEIGHT - BUBBLE_SIZE / 2;
    const y = Math.min(
      Math.max(top + BUBBLE_SIZE / 2 + 12, pos.y),
      maxY
    );

    return { x, y };
  };

  useEffect(() => {
    const handleResize = () => {
      const nextDefault = computeDefaultPos();
      setDefaultPos(nextDefault);
      setBubblePos((p) => {
        const nextPos = isSplitDragging
          ? nextDefault
          : snapToEdge({ ...p, x: p.x || nextDefault.x, y: p.y || nextDefault.y });
        return nextPos;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelRect, isSplitDragging]);

  useEffect(() => {
    const nextDefault = computeDefaultPos();
    setDefaultPos(nextDefault);
    setBubblePos((p) => {
      const nextPos = isSplitDragging
        ? nextDefault
        : snapToEdge({ ...p, x: p.x || nextDefault.x, y: p.y || nextDefault.y });
      return nextPos;
    });
  }, [panelRect?.left, panelRect?.top, panelRect?.width, panelRect?.height, isSplitDragging]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const flushPending = () => {
    if (!pendingPosRef.current) return;
    const next = pendingPosRef.current;
    setBubblePos(next);
    pendingPosRef.current = null;
    rafRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isSplitDragging) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (rect) {
      offsetRef.current = {
        x: e.clientX - (rect.left + rect.width / 2),
        y: e.clientY - (rect.top + rect.height / 2),
      };
    }
    holdTimerRef.current = window.setTimeout(() => {
      setIsDragging(true);
    }, DRAG_HOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const next = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
    pendingPosRef.current = next;
    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(flushPending);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }
    const wasDragging = isDragging;
    clearHoldTimer();
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (wasDragging) {
      setIsDragging(false);
      setBubblePos((pos) => {
        const snapped = snapToEdge(pos);
        return snapped;
      });
      return;
    }
    setIsDragging(false);
    onTabChange(Tab.PLAYING);
  };

  const handlePointerCancel = () => {
    clearHoldTimer();
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsDragging(false);
    setBubblePos((pos) => {
      const snapped = snapToEdge(pos);
      return snapped;
    });
  };

  useEffect(() => {
    // Keep the bubble anchored to the default spot while resizing the split pane.
    if (isSplitDragging === undefined) return;
    clearHoldTimer();
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsDragging(false);
    const nextDefault = computeDefaultPos();
    setDefaultPos(nextDefault);
    setBubblePos(nextDefault);
  }, [isSplitDragging]);

  const isDefaultPos = Math.abs(bubblePos.x - defaultPos.x) < 2 && Math.abs(bubblePos.y - defaultPos.y) < 2;
  const visibleNavItems = isDefaultPos ? navItems : navItems.filter(i => !i.special);

  return (
    <div className={`absolute bottom-0 w-full h-[70px] bg-[#121212] flex items-end pb-2 z-50 relative ${isDefaultPos ? 'justify-around' : 'justify-between px-5'}`}>
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        if (item.special) {
          return (
            <div key={item.id} className="w-16 flex flex-col items-center justify-end pointer-events-none">
              <span className={`text-[10px] font-medium mt-7 max-w-[90px] truncate px-1 transition-opacity ${isDefaultPos ? 'opacity-100 text-slate-400' : 'opacity-0 text-slate-400'} select-none`}>
                {currentSong ? currentSong.title : item.label}
              </span>
            </div>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center w-14 h-full pt-1 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </button>
        );
      })}

      <div
        ref={bubbleRef}
        className={`
          fixed z-[60]
          rounded-full border-[4px] border-[#121212]
          shadow-[0_0_15px_rgba(99,102,241,0.4)]
          overflow-hidden flex items-center justify-center
          bg-[#121212]
          ${isDragging ? 'scale-105 opacity-90 ring-2 ring-indigo-400/50' : 'transition-transform duration-200'}
          ${activeTab === Tab.PLAYING ? 'shadow-indigo-500/70' : ''}
        `}
        style={{
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          left: bubblePos.x,
          top: bubblePos.y,
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {currentSong ? (
          <>
            <img
              src={currentSong.coverUrl}
              alt="cover"
              className={`w-full h-full object-cover ${isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''}`}
              draggable={false}
            />
            <div className="absolute inset-0 m-auto w-3 h-3 bg-[#121212] rounded-full z-10 border border-slate-700" />
          </>
        ) : (
          <Disc size={24} className="animate-[spin_10s_linear_infinite]" />
        )}
      </div>
    </div>
  );
};

export default BottomNav;
