import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tab, SubView, Song } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Discover from './pages/Discover';
import PlayerSwiper from './components/PlayerSwiper';
import Local from './pages/Local';
import Mine from './pages/Mine';
import CheckIn from './pages/CheckIn';
import PlaylistDetail from './pages/PlaylistDetail';
import SeeAllSongs from './pages/SeeAllSongs';
import SeeAllPlaylists from './pages/SeeAllPlaylists';
import ChartDetail from './pages/ChartDetail';
import Settings from './pages/Settings';
import StatisticDetail from './pages/StatisticDetail';
import Recent from './pages/Recent';
import DownloadManager from './pages/DownloadManager';
import { getNative, safeToast } from './utils/fileSystem';
import { restoreFromLatestBackup, startAutoBackup } from './utils/autoBackup';
import SplashScreen from './components/SplashScreen';
import { initBackupScheduler } from './utils/db';

const DESKTOP_BREAKPOINT = 768;
const MIN_PANE_RATIO = 0.32;
const MAX_PANE_RATIO = 0.68;
const OVERLAY_PREF_KEY = 'hm_overlay_enabled';
const OVERLAY_POS_KEY = 'hm_overlay_pos';
const OVERLAY_SIZE_KEY = 'hm_overlay_size';
const OVERLAY_SIZE = 64;
const DISCOVER_VISIT_KEY = 'hm_discover_visit_v1';

const buildStoredOverlayPos = (): { x: number; y: number } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OVERLAY_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch { }
  return null;
};

const App: React.FC = () => {
  const [appReady, setAppReady] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [subView, setSubView] = useState<SubView>({ type: 'NONE' });
  const [isFullScreenPlayer, setIsFullScreenPlayer] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [viewMode, setViewMode] = useState<'music' | 'video'>('music');

  // ✅ 优化初始化：严格判断平板横屏逻辑
  const [isDualPane, setIsDualPane] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLandscape = w > h;
    const isTabletSize = w >= DESKTOP_BREAKPOINT && h >= 600;
    return isLandscape && isTabletSize;
  });

  // 平板竖屏时 (宽度 >= 768px)，此值为 false，页面将全宽显示
  const [shouldLimitWidth, setShouldLimitWidth] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth < DESKTOP_BREAKPOINT;
  });

  const [paneRatio, setPaneRatio] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(OVERLAY_PREF_KEY) === '1';
  });

  const [overlayPermission, setOverlayPermission] = useState(() => {
    const native = getNative();
    return !!native?.overlay?.hasPermission?.();
  });

  const initialOverlaySize = useMemo(() => {
    if (typeof window === 'undefined') return OVERLAY_SIZE;
    const stored = Number(localStorage.getItem(OVERLAY_SIZE_KEY) || OVERLAY_SIZE);
    return Number.isFinite(stored) && stored > 24 ? stored : OVERLAY_SIZE;
  }, []);

  const controlLockTimerRef = useRef<number | null>(null);
  const dualPaneRef = useRef<HTMLDivElement | null>(null);
  const [leftPaneRect, setLeftPaneRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // 用于布局检测的防抖定时器
  const layoutCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  const player = useAudioPlayer();
  const playerRef = useRef(player);
  const overlayChannelRef = useRef<BroadcastChannel | null>(null);
  const overlayUrlRef = useRef<string | null>(null);
  const overlayActiveRef = useRef(false);
  const overlaySizeRef = useRef<number>(initialOverlaySize);
  const overlaySupported = useMemo(() => !!getNative()?.overlay?.launch, []);

  const computeDefaultOverlayPos = useCallback(() => {
    if (typeof window === 'undefined') return { x: 120, y: 200 };
    const w = window.innerWidth || 360;
    const h = window.innerHeight || 640;
    return { x: Math.max(32, w - 96), y: Math.max(64, Math.round(h * 0.4)) };
  }, []);

  const buildOverlayUrl = useCallback(() => {
    if (overlayUrlRef.current) return overlayUrlRef.current;
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('overlay', '1');
    overlayUrlRef.current = url.toString();
    return overlayUrlRef.current;
  }, []);

  const buildOverlayLaunchParams = useCallback(() => {
    const baseUrl = buildOverlayUrl();
    const storedSize = Number(
      (typeof window !== 'undefined' && localStorage.getItem(OVERLAY_SIZE_KEY)) || overlaySizeRef.current || OVERLAY_SIZE
    );
    const size = Number.isFinite(storedSize) && storedSize > 24 ? storedSize : OVERLAY_SIZE;
    overlaySizeRef.current = size;
    const storedPos = buildStoredOverlayPos();
    const pos = storedPos || computeDefaultOverlayPos();
    if (!baseUrl) return { url: '', left: pos.x, top: pos.y, size };
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('ox', Math.max(0, Math.round(pos.x)).toString());
    urlObj.searchParams.set('oy', Math.max(0, Math.round(pos.y)).toString());
    urlObj.searchParams.set('size', size.toString());
    return { url: urlObj.toString(), left: Math.max(0, pos.x), top: Math.max(0, pos.y), size };
  }, [buildOverlayUrl, computeDefaultOverlayPos]);

  const closeOverlayWindow = useCallback(() => {
    if (!overlayActiveRef.current) return;
    const native = getNative();
    native?.overlay?.close?.();
    overlayActiveRef.current = false;
  }, []);

  const ensureOverlayPermission = useCallback(() => {
    const native = getNative();
    if (!native?.overlay) return false;
    const has = native.overlay.hasPermission?.();
    if (has === false) {
      native.overlay.requestPermission?.();
      safeToast('请先允许悬浮窗权限');
      setOverlayPermission(false);
      return false;
    }
    setOverlayPermission(true);
    return true;
  }, []);

  const launchOverlayWindow = useCallback(() => {
    const native = getNative();
    if (!native?.overlay?.launch) return;
    if (!ensureOverlayPermission()) return;

    const { url, left, top, size } = buildOverlayLaunchParams();
    if (!url) return;

    native.overlay.close?.();
    native.overlay.launch(url, size, size, true, left, top);
    native.overlay.showToolbar?.(false);
    native.overlay.setFocus?.(false);
    overlayActiveRef.current = true;
  }, [buildOverlayLaunchParams, ensureOverlayPermission]);

  useEffect(() => {
    // 启动自动备份和归档服务
    initBackupScheduler();
  }, []);

  useEffect(() => {
    playerRef.current = player;
  });

  useEffect(() => {
    const initApp = async () => {
      const startTime = Date.now();

      // 1. 等待 DxxSystem 挂载 (轮询检测)
      const waitForSystem = new Promise<void>((resolve) => {
        const check = () => {
          if ((window as any).DxxSystem) {
            resolve();
          } else {
            // 继续检查
            setTimeout(check, 100);
          }
        };
        // 最多等 6 秒，避免死循环（如果不是在 WebView 环境）
        setTimeout(resolve, 6000);
        check();
      });

      await waitForSystem;

      // 2. 确保至少展示了 3 秒动画
      const elapsed = Date.now() - startTime;
      if (elapsed < 3000) {
        await new Promise(r => setTimeout(r, 3000 - elapsed));
      }

      setAppReady(true);
    };

    initApp();
  }, []);

  // Auto Backup & Restore Logic
  useEffect(() => {
    restoreFromLatestBackup();
    const stop = startAutoBackup();
    return () => stop?.();
  }, []);

  // ==========================================
  // 新增：加载 DxxSystem 核心模块
  // ==========================================
  useEffect(() => {
    // 防止重复加载
    if (document.querySelector('script[src="SponsorUpdate5.4.js"]')) return;

    const script = document.createElement('script');
    script.src = 'SponsorUpdate5.4.js';
    script.async = true;
    script.onload = () => {
      console.log('DxxSystem loaded');
    };
    script.onerror = () => {
      console.warn('Failed to load SponsorUpdate5.4.js - skipping');
    }
    document.body.appendChild(script);
  }, []);

  const handleCheckUpdate = useCallback(() => {
    const sys = (window as any).DxxSystem;
    if (sys && sys.checkUpdate) {
      sys.checkUpdate();
    } else {
      console.warn('DxxSystem not loaded yet');
      safeToast('检查更新组件未就绪');
    }
  }, []);

  const handleOpenSponsor = useCallback(() => {
    const sys = (window as any).DxxSystem;
    if (sys && sys.openSponsor) {
      sys.openSponsor();
    } else {
      console.warn('DxxSystem not loaded yet');
      safeToast('组件未就绪');
    }
  }, []);
  // ==========================================

  // ✅ 核心修复：更精确的设备识别逻辑
  useEffect(() => {
    const checkLayout = () => {
      if (document.fullscreenElement) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const isLandscape = w > h;
      const isTabletSize = w >= DESKTOP_BREAKPOINT && h >= 600;

      setIsDualPane(isLandscape && isTabletSize);
      setShouldLimitWidth(w < DESKTOP_BREAKPOINT);
    };

    checkLayout();

    const handleResize = () => {
      if (layoutCheckTimerRef.current) clearTimeout(layoutCheckTimerRef.current);
      layoutCheckTimerRef.current = setTimeout(checkLayout, 100);
    };

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        if (layoutCheckTimerRef.current) clearTimeout(layoutCheckTimerRef.current);
      } else {
        const native = getNative();
        if (native?.control?.setLandscape) {
          native.control.setLandscape(false);
        }
        if (layoutCheckTimerRef.current) clearTimeout(layoutCheckTimerRef.current);
        layoutCheckTimerRef.current = setTimeout(checkLayout, 600);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (layoutCheckTimerRef.current) clearTimeout(layoutCheckTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isDualPane) {
      setLeftPaneRect(null);
      return;
    }
    const computeRect = () => {
      const rect = dualPaneRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLeftPaneRect({
        left: rect.left,
        top: rect.top,
        width: rect.width * paneRatio,
        height: rect.height,
      });
    };
    computeRect();
    window.addEventListener('resize', computeRect);
    return () => window.removeEventListener('resize', computeRect);
  }, [isDualPane, paneRatio]);

  useEffect(() => {
    window.history.pushState({ page: 'main' }, '');
    const handleBack = () => {
      if (isFullScreenPlayer) {
        setIsFullScreenPlayer(false);
        window.history.pushState({ page: 'main' }, '');
      } else if (subView.type !== 'NONE') {
        setSubView({ type: 'NONE' });
        window.history.pushState({ page: 'main' }, '');
      }
    };
    window.addEventListener('popstate', handleBack);
    const openCheckIn = () => {
      setSubView({ type: 'CHECK_IN' });
      setActiveTab(Tab.MINE);
      setIsFullScreenPlayer(false);
      window.history.pushState({ page: 'main' }, '');
    };
    window.addEventListener('hm-open-checkin' as any, openCheckIn);
    return () => {
      window.removeEventListener('popstate', handleBack);
      window.removeEventListener('hm-open-checkin' as any, openCheckIn);
    };
  }, [isFullScreenPlayer, subView]);

  useEffect(() => {
    const handlePlayMv = (e: CustomEvent<Song>) => {
      const song = e.detail;
      if (!song) return;
      player.playSong(song);
      setViewMode('video');
      if (!isDualPane) {
        setIsFullScreenPlayer(true);
        window.history.pushState({ page: 'player' }, '');
      } else {
        setIsFullScreenPlayer(false);
      }
    };

    window.addEventListener('hm-play-mv' as any, handlePlayMv);
    return () => window.removeEventListener('hm-play-mv' as any, handlePlayMv);
  }, [player, isDualPane]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('hm-overlay');
    overlayChannelRef.current = channel;

    const sendState = () => {
      const snapshot = playerRef.current;
      channel.postMessage({
        type: 'state',
        song: snapshot.currentSong,
        isPlaying: snapshot.isPlaying,
        progress: snapshot.progress,
        duration: snapshot.duration,
      });
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'command') {
        const action = data.action;
        const p = playerRef.current;
        switch (action) {
          case 'toggle':
            p.togglePlay();
            break;
          case 'next':
            p.playNext();
            break;
          case 'prev':
            p.playPrev();
            break;
          case 'open':
            setActiveTab(Tab.PLAYING);
            setIsFullScreenPlayer(true);
            break;
          default:
            break;
        }
      } else if (data.type === 'request_state') {
        sendState();
      }
    };

    channel.addEventListener('message', handleMessage);
    sendState();

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      overlayChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const channel = overlayChannelRef.current;
    if (!channel) return;
    channel.postMessage({
      type: 'state',
      song: player.currentSong,
      isPlaying: player.isPlaying,
      progress: player.progress,
      duration: player.duration,
    });
  }, [player.currentSong, player.isPlaying, player.progress, player.duration]);

  useEffect(() => {
    const native = getNative();
    if (!native?.overlay) return;
    setOverlayPermission(native.overlay.hasPermission?.() ?? false);
  }, []);

  useEffect(() => {
    if (!overlayEnabled || !overlaySupported) {
      closeOverlayWindow();
      return;
    }
    if (player.currentSong) {
      launchOverlayWindow();
    } else {
      closeOverlayWindow();
    }
  }, [overlayEnabled, overlaySupported, player.currentSong, closeOverlayWindow, launchOverlayWindow]);

  useEffect(() => () => closeOverlayWindow(), [closeOverlayWindow]);

  const handleTabChange = (tab: Tab) => {
    if (tab === Tab.PLAYING) {
      setControlsLocked(true);
      if (controlLockTimerRef.current) {
        window.clearTimeout(controlLockTimerRef.current);
      }
      controlLockTimerRef.current = window.setTimeout(() => {
        setControlsLocked(false);
        controlLockTimerRef.current = null;
      }, 350);
      if (!isDualPane) {
        setIsFullScreenPlayer(true);
        window.history.pushState({ page: 'player' }, '');
      }
      return;
    }

    setActiveTab(tab);
    if (tab === Tab.DISCOVER) {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      try {
        localStorage.setItem(DISCOVER_VISIT_KEY, JSON.stringify({ date: key }));
        window.dispatchEvent(new Event('hm-discover-visited'));
      } catch {
        // ignore persistence failure
      }
    }
    setSubView({ type: 'NONE' });
    if (!isDualPane) {
      setIsFullScreenPlayer(false);
    }
    if (controlLockTimerRef.current) {
      window.clearTimeout(controlLockTimerRef.current);
      controlLockTimerRef.current = null;
    }
    setControlsLocked(false);
  };

  useEffect(() => () => {
    if (controlLockTimerRef.current) {
      window.clearTimeout(controlLockTimerRef.current);
    }
  }, []);

  const handleOverlayToggle = (enabled: boolean) => {
    if (!overlaySupported) {
      safeToast('当前环境不支持悬浮窗');
      return;
    }
    setOverlayEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem(OVERLAY_PREF_KEY, enabled ? '1' : '0');
    }
    if (enabled) {
      if (ensureOverlayPermission() && player.currentSong) {
        launchOverlayWindow();
      }
    } else {
      closeOverlayWindow();
    }
  };

  const handleChartSearch = (keyword: string) => {
    setSubView({ type: 'NONE' });
    setActiveTab(Tab.DISCOVER);
    localStorage.setItem('temp_auto_search', keyword);
    setTimeout(() => setActiveTab(Tab.DISCOVER), 0);
  };

  const commonProps = { onBack: () => setSubView({ type: 'NONE' }) };

  const renderPrimaryContent = () => {
    switch (activeTab) {
      case Tab.HOME: return <Home onPlaySong={player.playSong} onNavigateCheckIn={() => setSubView({ type: 'CHECK_IN' })} onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} onNavigateSeeAllSongs={() => setSubView({ type: 'SEE_ALL_SONGS' })} onNavigateSeeAllPlaylists={() => setSubView({ type: 'SEE_ALL_PLAYLISTS' })} />;
      case Tab.DISCOVER: return <Discover onPlaySong={player.playSong} currentSong={player.currentSong} onNavigateChart={(t, g, c) => setSubView({ type: 'CHART_DETAIL', title: t, gradient: g, chartId: c })} onAddToQueue={player.addToQueue} />;
      case Tab.LOCAL: return <Local onPlaySong={player.playSong} onPlayList={player.playList} onAddToQueue={player.addToQueue} onAddToNext={player.addToNext} />;
      case Tab.MINE: return <Mine onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} onNavigateSettings={() => setSubView({ type: 'SETTINGS' })} onNavigateChart={() => setSubView({ type: 'STATISTIC_DETAIL' })} onNavigateRecent={() => setSubView({ type: 'RECENT' })} onNavigateLocal={() => setActiveTab(Tab.LOCAL)} onNavigateCheckIn={() => setSubView({ type: 'CHECK_IN' })} onNavigateDownloads={() => setSubView({ type: 'DOWNLOADS' })} />;
      default: return null;
    }
  };

  const renderSubView = () => {
    switch (subView.type) {
      case 'CHECK_IN': return <CheckIn {...commonProps} />;
      case 'PLAYLIST_DETAIL': return <PlaylistDetail playlist={subView.playlist} {...commonProps} onPlaySong={player.playSong} onPlayList={player.playList} onAddToQueue={player.addToQueue} onAddAllToQueue={player.addAllToQueue} currentSong={player.currentSong} />;
      case 'SEE_ALL_SONGS': return <SeeAllSongs {...commonProps} onPlaySong={player.playSong} onAddToQueue={player.addToQueue} onAddAllToQueue={player.addAllToQueue} currentSong={player.currentSong} />;
      case 'SEE_ALL_PLAYLISTS': return <SeeAllPlaylists {...commonProps} onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} />;
      case 'CHART_DETAIL': return <ChartDetail title={subView.title} gradient={subView.gradient} chartId={subView.chartId} {...commonProps} onSearch={handleChartSearch} currentSong={player.currentSong} />;
      case 'STATISTIC_DETAIL': return <StatisticDetail {...commonProps} />;
      case 'SETTINGS': return (
        <Settings
          {...commonProps}
          overlayEnabled={overlayEnabled}
          overlayPermission={overlayPermission}
          overlaySupported={overlaySupported}
          onToggleOverlay={handleOverlayToggle}
          onRequestOverlayPermission={ensureOverlayPermission}
          onCheckUpdate={handleCheckUpdate}
          onOpenSponsor={handleOpenSponsor}
        />
      );
      case 'RECENT': return <Recent {...commonProps} onPlaySong={player.playSong} onAddToQueue={player.addToQueue} />;
      case 'DOWNLOADS': return <DownloadManager {...commonProps} onPlaySong={player.playSong} />;
      default: return null;
    }
  };

  const renderMainContent = () => {
    if (subView.type !== 'NONE' && !isDualPane) return renderSubView();
    return renderPrimaryContent();
  };

  const updatePaneRatio = (clientX: number) => {
    const rect = dualPaneRef.current?.getBoundingClientRect();
    const width = rect?.width || window.innerWidth || 1;
    const left = rect?.left || 0;
    const raw = (clientX - left) / width;
    const clamped = Math.min(MAX_PANE_RATIO, Math.max(MIN_PANE_RATIO, raw));
    setPaneRatio(clamped);
  };

  const handleSplitterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDualPane) return;
    e.preventDefault();
    e.stopPropagation();
    updatePaneRatio(e.clientX);
    setIsDraggingSplit(true);

    const handleMove = (ev: PointerEvent) => updatePaneRatio(ev.clientX);
    const handleUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleClosePlayer = () => {
    if (controlLockTimerRef.current) {
      window.clearTimeout(controlLockTimerRef.current);
      controlLockTimerRef.current = null;
    }
    setControlsLocked(false);
    if (!isDualPane) {
      setIsFullScreenPlayer(false);
      window.history.back();
    }
  };

  const leftPaneWidth = `${paneRatio * 100}%`;
  const rightPaneWidth = `${(1 - paneRatio) * 100}%`;
  const showOverlayPlayer = isFullScreenPlayer && player.currentSong && !isDualPane;
  const showBottomNav = subView.type === 'NONE' && !isDualPane;

  return (
    <>
      <SplashScreen finishLoading={appReady} />
      <div
        className={`
           relative w-full h-screen overflow-hidden flex flex-col 
           ${shouldLimitWidth ? ' shadow-2xl' : ''} 
           bg-[#121212] transition-colors duration-300
           ${appReady ? 'opacity-100 visible' : 'opacity-0 invisible'} 
           transition-opacity duration-500
         `}
      >
        <div className="absolute inset-0 z-[-1] overflow-hidden opacity-50 transition-opacity duration-500 pointer-events-none">
          <div className="absolute  rounded-full bg-indigo-500/30 blur-[100px]" />
          <div className="absolute rounded-full bg-purple-500/30 blur-[100px]" />
        </div>

        <div className="flex-1 overflow-hidden relative z-0 py-2">
          {isDualPane ? (
            <div
              ref={dualPaneRef}
              className="h-full w-full flex rounded-3xl overflow-hidden bg-black/40 backdrop-blur-md border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            >
              <div className="h-full overflow-hidden flex-shrink-0 relative flex flex-col" style={{ width: leftPaneWidth }}>
                <div className="flex-1 overflow-y-auto pb-[78px]">{renderPrimaryContent()}</div>
                <div className="absolute left-0 right-0 bottom-0">
                  <BottomNav
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    currentSong={player.currentSong}
                    isPlaying={player.isPlaying}
                    panelRect={leftPaneRect || undefined}
                    isSplitDragging={isDraggingSplit}
                  />
                </div>
              </div>

              <div
                className="relative w-3 flex-shrink-0 cursor-col-resize group z-30"
                onPointerDown={handleSplitterPointerDown}
                style={{ touchAction: 'none' }}
              >
                <div className="absolute inset-y-6 left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-white/15 group-hover:bg-indigo-400/70 transition-colors" />
                <button
                  aria-label="拖动分栏"
                  className={`
                  absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                  w-9 h-9 flex items-center justify-center gap-[3px]
                  text-white/80 transition-colors duration-200
                `}
                >
                  <span className="w-1 h-[10px] rounded-full bg-white/60 group-hover:bg-white/80" />
                  <span className="w-1 h-[16px] rounded-full bg-white/80 group-hover:bg-white" />
                  <span className="w-1 h-[10px] rounded-full bg-white/60 group-hover:bg-white/80" />
                </button>
              </div>

              <div className="h-full overflow-hidden relative border-l border-white/10 flex-shrink-0" style={{ width: rightPaneWidth }}>
                <div className="relative h-full">
                  {player.currentSong ? (
                    <PlayerSwiper
                      currentSong={player.currentSong}
                      playlist={player.playlist}
                      isPlaying={player.isPlaying}
                      progress={player.progress}
                      duration={player.duration}
                      mode={player.mode}
                      setMode={player.setMode}
                      onClose={handleClosePlayer}
                      onTogglePlay={player.togglePlay}
                      onNext={player.playNext}
                      onPrev={player.playPrev}
                      onSeek={player.setProgress}
                      onPlayFromQueue={player.playSong}
                      onRemoveFromQueue={player.removeFromQueue}
                      onUpdateSong={player.updateSongInPlaylist}
                      onAddToQueue={player.addToQueue}
                      onAddToNext={player.addToNext}
                      viewMode={viewMode}
                      setViewMode={setViewMode}
                      controlsLocked={controlsLocked}
                      variant="panel"
                    />
                  ) : (
                    <div className="h-full w-full bg-[#0f0f0f] text-slate-400 flex items-center justify-center text-sm">
                      右侧固定展示播放页，点一首歌开始播放吧
                    </div>
                  )}

                  {subView.type !== 'NONE' && (
                    <div className="absolute inset-0 z-20 overflow-y-auto bg-[#121212] shadow-[0_0_40px_rgba(0,0,0,0.55)] border-l border-white/10">
                      {renderSubView()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            renderMainContent()
          )}
        </div>

        {showBottomNav && (
          <BottomNav
            activeTab={activeTab}
            onTabChange={handleTabChange}
            currentSong={player.currentSong}
            isPlaying={player.isPlaying}
          />
        )}

        {showOverlayPlayer && (
          <PlayerSwiper
            currentSong={player.currentSong}
            playlist={player.playlist}
            isPlaying={player.isPlaying}
            progress={player.progress}
            duration={player.duration}
            mode={player.mode}
            setMode={player.setMode}
            onClose={handleClosePlayer}
            onTogglePlay={player.togglePlay}
            onNext={player.playNext}
            onPrev={player.playPrev}
            onSeek={player.setProgress}
            onPlayFromQueue={player.playSong}
            onRemoveFromQueue={player.removeFromQueue}
            onUpdateSong={player.updateSongInPlaylist}
            onAddToQueue={player.addToQueue}
            onAddToNext={player.addToNext}
            viewMode={viewMode}
            setViewMode={setViewMode}
            controlsLocked={controlsLocked}
          />
        )}
      </div>
    </>
  );
};

export default App;