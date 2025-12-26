import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Song } from '../types';
import {
  ChevronDown, Play, Pause, Repeat, Repeat1, Shuffle, Heart, ListMusic,
  MoreHorizontal, Tv, Music, X, Volume2, Trash2, Download, Loader2,
  ChevronLeft, ChevronRight, Maximize2,
  MoreVertical
} from 'lucide-react';
import 'swiper/css';
import { useSongActions } from '../hooks/useSongActions';
import SongActionSheet from '../components/SongActionSheet';
import PlaySettingsSheet from '../components/PlaySettingsSheet';
import { fetchMusicVideo, searchMusic, fetchSongDetail } from '../utils/api';
import { isSongInFavorites } from '../utils/playlistStore';
import { safeToast, getNative, saveDownloadedMedia, saveTextFile } from '../utils/fileSystem';
import { dbSaveLocalSong, dbGetLocalSongs} from '../utils/db';

interface PlayingProps {
  song: Song;
  playlist: Song[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  mode: string;
  setMode: (mode: any) => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (val: number) => void;
  onPlayFromQueue: (song: Song) => void;
  onRemoveFromQueue: (id: string) => void;
  isActiveSlide: boolean;
  viewMode: 'music' | 'video';
  setViewMode: (mode: 'music' | 'video') => void;
  onAddToQueue: (song: Song) => void;
  onAddToNext: (song: Song) => void;
  controlsLocked: boolean;
}

const Playing: React.FC<PlayingProps> = ({
  song, playlist, isPlaying, progress, duration, mode, setMode,
  onClose, onTogglePlay, onNext, onPrev, onSeek,
  onPlayFromQueue, onRemoveFromQueue, isActiveSlide,
  viewMode, setViewMode,
  onAddToQueue,
  onAddToNext,
  controlsLocked
}) => {
  const PLAYING_SETTING_KEY = 'hm_playing_settings';
  // 检查是否全局全屏
  const isGlobalFullscreen = localStorage.getItem('hm_setting_fullscreen') === 'true';

  const loadPlaySettings = () => {
    try {
      const raw = localStorage.getItem(PLAYING_SETTING_KEY);
      // 如果全局全屏开启，强制默认为 immersive (沉浸模式)
      const defaultLayout = isGlobalFullscreen ? 'immersive' : 'classic';
      
      if (!raw) return { autoFetchMeta: true, preferHiRes: true, autoHiRes: true, personalize: false, layoutStyle: defaultLayout };
      const parsed = JSON.parse(raw);
      return {
        autoFetchMeta: !!parsed.autoFetchMeta,
        preferHiRes: !!parsed.preferHiRes,
        autoHiRes: parsed.autoHiRes ?? true,
        personalize: !!parsed.personalize,
        // 如果全局全屏，忽略存储的设置，强制 immersive
        layoutStyle: isGlobalFullscreen ? 'immersive' : (parsed.layoutStyle === 'immersive' ? 'immersive' : 'classic'),
      };
    } catch {
      return { autoFetchMeta: true, preferHiRes: true, autoHiRes: true, personalize: false, layoutStyle: isGlobalFullscreen ? 'immersive' : 'classic' };
    }
  };

  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showPlaySettings, setShowPlaySettings] = useState(false);
  const [playSettings, setPlaySettings] = useState(loadPlaySettings());
  const [coverLyricPos, setCoverLyricPos] = useState<number>(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const coverTextWrapperRef = useRef<HTMLDivElement>(null);
  const coverTextInnerRef = useRef<HTMLSpanElement>(null);
  const [coverScrollDistance, setCoverScrollDistance] = useState(0);
  const coverScrollRafRef = useRef<number>();


  const scrollToActiveLyric = (behavior: ScrollBehavior = 'smooth') => {
    if (!lyricScrollRef.current) return;
    const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior, block: 'center' });
    }
  };

  // 定义 quality 和 isSQ 变量
  const quality = song.quality || 'SQ无损';
  const isSQ = quality === 'SQ无损' || quality === 'HR';

  const songActions = useSongActions({ addToQueue: onAddToQueue, addToNext: onAddToNext });
  const [actionOpen, setActionOpen] = useState(false);

  const [lyricsLines, setLyricsLines] = useState<{ time: number, text: string }[]>([]);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const lyricScrollRef = useRef<HTMLDivElement>(null);

  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isImmersive = playSettings.personalize && playSettings.layoutStyle === 'immersive';

  useEffect(() => {
    localStorage.setItem(PLAYING_SETTING_KEY, JSON.stringify(playSettings));
  }, [playSettings]);

  // 管理非全局全屏下的临时全屏状态
  useEffect(() => {
    // 如果是全局全屏，这里不做处理（由系统级保持全屏）
    if (isGlobalFullscreen) return;

    const native = getNative();
    if (!native?.control?.setFullscreen) return;

    if (playSettings.layoutStyle === 'immersive') {
      // 切换到沉浸模式 -> 开启临时全屏
      native.control.setFullscreen(true);
    } else {
      // 切换回经典模式 -> 关闭临时全屏
      native.control.setFullscreen(false);
    }

    return () => {
      // 卸载组件（退出播放页）时：
      // 如果当前是沉浸模式且不是全局全屏，需要关闭全屏
      if (playSettings.layoutStyle === 'immersive') {
        native.control.setFullscreen(false);
      }
    };
  }, [playSettings.layoutStyle, isGlobalFullscreen]);

  const togglePlaySetting = (key: keyof typeof playSettings, label: string) => {
    setPlaySettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      safeToast(`${label}：${next[key] ? '已开启' : '已关闭'}`);
      return next;
    });
  };

// --- 核心修复：完善词图匹配逻辑 ---
  const handleManualMatchMeta = async () => {
    if (!song) return;
    safeToast('正在搜索匹配信息...');

    try {
      // 1. 联网搜索
      // 为了提高准确率，去除括号内的内容再搜索 (如 "歌曲(Live)" -> "歌曲")
      const cleanTitle = song.title.replace(/\(.*\)|（.*）/g, '').trim();
      const keywords = `${cleanTitle} ${song.artist}`.trim();
      
      const searchResults = await searchMusic(keywords);
      
      if (!searchResults || searchResults.length === 0) {
        safeToast('未找到匹配的歌曲信息');
        return;
      }

      // 默认取第一个匹配项
      const bestMatch = searchResults[0];
      const detail = await fetchSongDetail(bestMatch);
      
      let isUpdated = false;
      
      // 更新内存中的对象 (用于即时显示)
      // 注意：直接修改 props 对象在 React 中是不推荐的，但在这里为了即时反馈且不重载整个播放器，
      // 我们采用原地修改引用 + 触发状态更新的策略。
      
      // 2. 处理歌词
      if (detail.lyrics && detail.lyrics.length > 10) {
        // 如果是本地音乐，保存到文件
        if (song.source === 'local' || song.path) {
           const lrcName = `${song.title}-${song.artist}.lrc`;
           const lrcPath = saveTextFile(lrcName, detail.lyrics, 'lrcs');
           if (lrcPath) {
             song.lyrics = `file://${lrcPath}`; // 更新路径
           } else {
             song.lyrics = detail.lyrics; // 降级：只更新内存
           }
        } else {
           song.lyrics = detail.lyrics; // 在线音乐直接更新内存
        }
        
        // 强制刷新歌词解析
        const lines = detail.lyrics.split('\n')
          .map(line => {
            const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
            if (match) {
              const min = parseInt(match[1]);
              const sec = parseInt(match[2]);
              const ms = parseInt(match[3]);
              const time = min * 60 + sec + ms / 100;
              return { time, text: match[4].trim() };
            }
            return null;
          })
          .filter((item): item is { time: number, text: string } => item !== null && item.text !== '');
        setLyricsLines(lines);
        isUpdated = true;
      }

      // 3. 处理封面
      if (detail.coverUrl && !detail.coverUrl.includes('unsplash')) {
         // 如果是本地音乐，下载并保存封面
         if ((song.source === 'local' || song.path) && song.title) {
            try {
                safeToast('正在下载高清封面...');
                const resp = await fetch(detail.coverUrl);
                const blob = await resp.blob();
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
                
                const picName = `${song.title}-${song.artist}.jpg`;
                const picPath = saveDownloadedMedia(picName, base64, 'picture');
                
                if (picPath) {
                    const newCoverPath = `file://${picPath}`;
                    song.coverUrl = newCoverPath;
                    // 强制刷新背景图 (通过触发重绘或简单的状态切换，这里React会根据key或props变化自动刷，
                    // 但由于我们改的是引用，可能需要一点黑魔法，比如切换一下 showLyrics)
                } else {
                    song.coverUrl = detail.coverUrl;
                }
            } catch (e) {
                console.warn('Cover download failed, using remote url', e);
                song.coverUrl = detail.coverUrl;
            }
         } else {
             song.coverUrl = detail.coverUrl;
         }
         isUpdated = true;
      }

      // 4. 如果是本地音乐，更新数据库
      if (isUpdated && (song.source === 'local' || song.path)) {
          // 构造符合 LocalSong 接口的对象
          const dbItem = {
              ...song,
              addDate: Date.now(), // 保持活跃
              playCount: 0, // 保持原样最好，这里简化
              source: song.source || 'local',
              quality: song.quality || 'Local'
          };
          // @ts-ignore
          await dbSaveLocalSong(dbItem);
          // 通知外部列表刷新
          window.dispatchEvent(new Event('hm-local-refresh'));
      }

      if (isUpdated) {
          safeToast('匹配成功，已更新信息');
          // 触发一个小状态变化以强制重新渲染图片
          setShowLyrics(prev => !prev);
          setTimeout(() => setShowLyrics(prev => !prev), 50);
      } else {
          safeToast('未发现更好的元数据');
      }

    } catch (e) {
      console.error(e);
      safeToast('匹配过程中发生错误');
    }
  };

  const handleManualHiRes = () => {
    safeToast('正在尝试获取更高音质...');
    // 具体提质逻辑可在此处对接接口
  };

  const handleLayoutChange = (layout: 'classic' | 'immersive') => {
    if (isGlobalFullscreen && layout === 'classic') {
        safeToast('全局全屏模式下无法切换到经典样式');
        return;
    }
    setPlaySettings(prev => ({ ...prev, layoutStyle: layout }));
    safeToast(`已切换为${layout === 'classic' ? '经典' : '沉浸'}样式`);
  };

  // 视频专用
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0
  });
  const landscapeRequestRef = useRef<{ requestedAt: number; active: boolean }>({ requestedAt: 0, active: false });
  const isVideoFullscreen = viewMode === 'video' && isFullscreen;
  // 记录每首歌在不同模式下的进度
  const progressMemoryRef = useRef<Record<string, { music?: number; video?: number }>>({});

  // 主动控制视频播放/暂停，避免依赖音频播放状态
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (viewMode === 'video' && isActiveSlide && song.mvUrl) {
      el.play().catch(() => { });
    } else {
      el.pause();
    }
  }, [viewMode, isActiveSlide, song.mvUrl]);

  // MV 自动获取逻辑：保持模式切换流畅，即使暂无 MV 也不强制回退
  useEffect(() => {
    if (viewMode === 'video' && isActiveSlide && !song.mvUrl) {
      fetchMusicVideo(song.title).then((url) => {
        if (url) {
          song.mvUrl = url;
          // 依赖 song 属性变更触发重绘
        } else {
          safeToast('未找到该歌曲的 MV');
          // 保持在视频模式，交由用户自行切换
        }
      });
    }
  }, [viewMode, isActiveSlide, song]);

  const refreshFavorite = () => {
    if (!song?.id) {
      setIsFavorite(false);
      return;
    }
    isSongInFavorites(song.id).then(setIsFavorite);
  };

  useEffect(() => {
    refreshFavorite();
    const positions = [2 / 7, 4 / 7, 6 / 7];
    setCoverLyricPos(positions[Math.floor(Math.random() * positions.length)]);
  }, [song?.id]);

  useEffect(() => {
    const handler = () => refreshFavorite();
    window.addEventListener('playlist-updated', handler);
    return () => window.removeEventListener('playlist-updated', handler);
  }, [song?.id]);

  // 每次歌词行切换时也随机位置
  useEffect(() => {
    const positions = [2 / 7, 4 / 7, 6 / 7];
    setCoverLyricPos(positions[Math.floor(Math.random() * positions.length)]);
  }, [activeLyricIndex]);

  const handleVideoPlay = () => {
    setVideoState(prev => ({ ...prev, isPlaying: true }));
    if (isPlaying) {
      onTogglePlay(); // 视频播放时暂停音乐
    }
  };

  const handleVideoPause = () => {
    setVideoState(prev => ({ ...prev, isPlaying: false }));
  };

  // 解析歌词
  useEffect(() => {
    if (song.lyrics && song.lyrics.trim()) {
      const lines = song.lyrics.split('\n')
        .map(line => {
          const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
          if (match) {
            const min = parseInt(match[1]);
            const sec = parseInt(match[2]);
            const ms = parseInt(match[3]);
            const time = min * 60 + sec + ms / 100;
            return { time, text: match[4].trim() };
          }
          return null;
        })
        .filter((item): item is { time: number, text: string } => item !== null && item.text !== '');
      setLyricsLines(lines);
    } else {
      setLyricsLines([]);
    }
  }, [song.id, song.lyrics]);

  useEffect(() => {
    if (!isActiveSlide) return;

    const idx = lyricsLines.findIndex(line => line.time > progress) - 1;
    const targetIndex = idx >= 0 ? idx : 0;
    const leadIdx = lyricsLines.findIndex(line => line.time > progress + 1.2);
    const scrollIndex = leadIdx > 0 ? Math.max(leadIdx - 1, 0) : targetIndex;
    setActiveLyricIndex(targetIndex);

    if (showLyrics && lyricScrollRef.current && !isUserScrolling.current) {
      const activeEl = lyricScrollRef.current.children[scrollIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [progress, lyricsLines, showLyrics, isActiveSlide]);

  // 打开歌词或当前行变化时，立即居中当前行
  useEffect(() => {
    if (showLyrics && isActiveSlide) {
      isUserScrolling.current = false;
      setTimeout(() => scrollToActiveLyric('auto'), 20);
    }
  }, [showLyrics, activeLyricIndex, isActiveSlide]);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setVideoState(prev => ({ ...prev, currentTime: videoRef.current!.currentTime }));
    }
  };
  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoState(prev => ({ ...prev, duration: videoRef.current!.duration }));
    }
  };

  const currentIsPlaying = viewMode === 'music' ? isPlaying : videoState.isPlaying;
  const currentProgress = viewMode === 'music' ? progress : videoState.currentTime;
  const currentDuration = viewMode === 'music' ? duration : videoState.duration;

  const unifiedTogglePlay = () => {
    if (controlsLocked) return;
    if (viewMode === 'music') {
      if (videoState.isPlaying && videoRef.current) {
        videoRef.current.pause();
      }
      onTogglePlay();
    } else {
      if (videoRef.current) {
        if (videoState.isPlaying) {
          videoRef.current.pause();
        } else {
          if (isPlaying) {
            onTogglePlay(); // 暂停音乐
          }
          videoRef.current.play();
        }
      }
    }
  };

  const unifiedSeek = (val: number) => {
    if (viewMode === 'music') {
      onSeek(val);
      if (showLyrics) {
        isUserScrolling.current = false;
        setTimeout(() => scrollToActiveLyric('auto'), 50);
      }
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = val;
        setVideoState(prev => ({ ...prev, currentTime: val }));
      }
    }
  };

  const handleLyricScroll = () => {
    isUserScrolling.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { isUserScrolling.current = false; }, 4000);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleLyricsDisplay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (viewMode === 'music') {
      setShowLyrics(prev => !prev);
    }
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await songActions.handleAddToFavorites(song);
    if (typeof res === 'boolean') setIsFavorite(res);
  };

  const hasLyrics = lyricsLines.length > 0;
  const currentLine = useMemo(() => lyricsLines[activeLyricIndex], [lyricsLines, activeLyricIndex]);
  const nextLine = useMemo(() => lyricsLines[activeLyricIndex + 1], [lyricsLines, activeLyricIndex]);
  const VISUAL_LEAD_SECONDS = 0.8; // 提前一点点让颜色先动起来

  const lineProgress = useMemo(() => {
    if (!currentLine) return 0;
    const start = currentLine.time || 0;
    const end = nextLine?.time ?? currentDuration ?? start + 1;
    if (end <= start) return 0;
    const ratio = (currentProgress + VISUAL_LEAD_SECONDS - start) / (end - start);
    return Math.min(1, Math.max(0, ratio));
  }, [currentLine, nextLine, currentDuration, currentProgress]);
  const activeLineProgress = Math.min(100, Math.max(0, lineProgress * 100));

  const activeLineBarStyle = useMemo(() => ({
    width: `${activeLineProgress}%`,
    pointerEvents: 'none' as const
  }), [activeLineProgress]);

  const coverScrollRatio = useMemo(() => {
    if (!currentLine) return 0;
    const start = currentLine.time || 0;
    const end = nextLine?.time ?? currentDuration ?? start + 1;
    if (end <= start) return 0;
    const raw = (currentProgress - start) / (end - start);
    if (raw <= 0.5) return 0; // 前半不动
    const t = Math.min(1, Math.max(0, (raw - 0.5) / 0.5));
    // 缓出曲线，让滑动更平缓
    const eased = 1 - Math.pow(1 - t, 3);
    return eased;
  }, [currentLine, nextLine, currentDuration, currentProgress]);

  useEffect(() => {
    const wrapper = coverTextWrapperRef.current;
    const inner = coverTextInnerRef.current;
    if (!inner) return;

    // Reset first to avoid residual offset
    inner.style.transform = 'translateX(0px)';

    if (!wrapper || showLyrics || viewMode !== 'music' || !isActiveSlide) {
      setCoverScrollDistance(0);
      return;
    }

    const wrapperWidth = wrapper.clientWidth;
    const innerWidth = inner.scrollWidth;
    if (!wrapperWidth || innerWidth <= wrapperWidth + 4) {
      setCoverScrollDistance(0);
      return;
    }
    // Stop with 10px gap between text end and capsule edge
    const distance = Math.max(0, innerWidth - wrapperWidth + 10);
    setCoverScrollDistance(distance);
  }, [showLyrics, viewMode, activeLyricIndex, song.id, currentLine?.text, isActiveSlide]);

  const coverScrollOffset = useMemo(() => {
    if (coverScrollDistance <= 0) return 0;
    return coverScrollDistance * coverScrollRatio;
  }, [coverScrollDistance, coverScrollRatio]);

  useEffect(() => {
    const inner = coverTextInnerRef.current;
    if (!inner) return;

    // Light smoothing while keeping in sync with time progress
    inner.style.transition = coverScrollDistance > 0 ? 'transform 160ms linear' : 'none';
    inner.style.willChange = coverScrollDistance > 0 ? 'transform' : 'auto';

    const applyTransform = () => {
      if (!inner) return;
      inner.style.transform = `translate3d(-${coverScrollOffset}px, 0, 0)`;
    };

    if (coverScrollRafRef.current) cancelAnimationFrame(coverScrollRafRef.current);
    coverScrollRafRef.current = requestAnimationFrame(applyTransform);

    return () => {
      if (coverScrollRafRef.current) cancelAnimationFrame(coverScrollRafRef.current);
    };
  }, [coverScrollDistance, coverScrollOffset, currentLine?.text]);

  const handleLandscapePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = videoRef.current;
    if (!target) return;
    landscapeRequestRef.current = { requestedAt: Date.now(), active: true };
    setIsFullscreen(true); // 作为“横屏模式”开关，即便浏览器拒绝全屏也保持 UI
    try {
      const native = getNative();
      if (native?.control) {
        native.control.setLandscape(true);
        native.control.setFullscreen(true);
      }
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.parentElement?.requestFullscreen) {
        await target.parentElement.requestFullscreen();
      }
      const orientation = (screen as any)?.orientation;
      if (orientation?.lock) {
        orientation.lock('landscape').catch(() => { });
      }
    } catch { }
  };

  // ✅ 修复：增强退出全屏逻辑，确保恢复竖屏和非全屏状态
  const exitFullscreen = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    landscapeRequestRef.current = { requestedAt: 0, active: false };
    
    try {
      // 1. 调用原生接口恢复竖屏和状态栏
      const native = getNative();
      if (native?.control) {
        native.control.setLandscape(false);  // 关闭横屏锁定
        native.control.setFullscreen(false); // 退出沉浸式全屏
      }

      // 2. 解锁屏幕方向（Web标准）
      const orientation = (screen as any)?.orientation;
      if (orientation?.unlock) {
        try { orientation.unlock(); } catch { }
      }

      // 3. 退出浏览器全屏（Web标准）
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Exit fullscreen error:", err);
    } finally {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!document.fullscreenElement;
      if (fs) {
        setIsFullscreen(true);
        landscapeRequestRef.current.active = true;
        return;
      }

      // 某些设备会在请求全屏后立刻触发退出事件，这里做短暂容忍，避免“进入就退出”
      const recentlyRequested = Date.now() - landscapeRequestRef.current.requestedAt < 800;
      if (recentlyRequested && viewMode === 'video') {
        setIsFullscreen(true);
        return;
      }

      setIsFullscreen(false);
      landscapeRequestRef.current = { requestedAt: 0, active: false };
      if (viewMode === 'video') {
        try {
          const native = getNative();
          // 确保退出时恢复设置
          native?.control?.setLandscape(false);
          native?.control?.setFullscreen(false);
          const orientation = (screen as any)?.orientation;
          orientation?.unlock?.();
        } catch { }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (viewMode !== 'video' && isFullscreen) {
      exitFullscreen();
    }
  }, [viewMode, isFullscreen]);

  // 进度记忆：根据当前模式记录
  useEffect(() => {
    if (!song.id || !isActiveSlide) return;
    const mem = progressMemoryRef.current[song.id] || {};
    if (viewMode === 'music') {
      mem.music = progress;
    } else {
      mem.video = videoState.currentTime;
    }
    progressMemoryRef.current[song.id] = mem;
  }, [song.id, viewMode, progress, videoState.currentTime, isActiveSlide]);

  // 在切换歌曲或模式时恢复对应进度
  useEffect(() => {
    if (!song.id || !isActiveSlide) return;
    const mem = progressMemoryRef.current[song.id] || {};
    if (viewMode === 'music') {
      if (mem.music != null && Math.abs(mem.music - progress) > 1) {
        onSeek(mem.music);
      }
    } else {
      if (videoRef.current && mem.video != null) {
        videoRef.current.currentTime = mem.video;
        setVideoState(prev => ({ ...prev, currentTime: mem.video }));
      } else if (videoRef.current && mem.video == null) {
        videoRef.current.currentTime = 0;
        setVideoState(prev => ({ ...prev, currentTime: 0 }));
      }
    }
  }, [song.id, viewMode, isActiveSlide]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#121212] text-white overflow-hidden">
      {/* 动态模糊背景 */}
      <div className="absolute inset-0 z-0">
        <img src={song.coverUrl} alt="bg" className="w-full h-full object-cover opacity-80 blur-3xl scale-125 transition-opacity duration-700" />
        <div className={`absolute inset-0 ${isImmersive ? 'bg-gradient-to-tr from-black/60 via-black/40 to-indigo-900/30' : 'bg-black/40'}`} />
        {isImmersive && (
          <div className="absolute inset-0 pointer-events-none mix-blend-screen opacity-40">
            <div className="absolute w-64 h-64 bg-indigo-500/40 rounded-full blur-3xl -top-10 -left-10 animate-pulse" />
            <div className="absolute w-72 h-72 bg-purple-500/30 rounded-full blur-3xl bottom-0 right-[-60px] animate-pulse" />
          </div>
        )}
      </div>

      {/* 顶部导航 */}
      <div className={`relative z-20 flex items-center justify-between px-4 py-4 mt-safe-top ${isVideoFullscreen ? 'hidden' : ''}`}>
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white rounded-full transition-transform active:scale-95">
          <ChevronDown size={32} />
        </button>

        <div className="flex bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/10">
          <button
            onClick={() => setViewMode('music')}
            className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'music' ? ' text-slate-300' : 'text-slate-500'}`}
          >
            <Music size={12} /> 歌曲
          </button>
            
{/* 竖线分隔符 */}
  <div className="w-px bg-white/20 my-1.5"></div>
          <button
            onClick={() => setViewMode('video')}
            className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'video' ? ' text-slate-300' : 'text-slate-500'}`}
          >
            MV <Tv size={12} />
          </button>
        </div>

        <button
          onClick={() => setShowPlaySettings(true)}
          className="p-2 text-slate-300 hover:text-white rounded-full transition-transform active:scale-110"
        >
          <MoreHorizontal size={24} />
        </button>
      </div>

      {/* 中间内容区 */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full  min-h-0" onClick={toggleLyricsDisplay}>
        {viewMode === 'music' ? (
          !showLyrics ? (
            <div className="w-full flex items-center justify-center animate-in zoom-in duration-500 px-6">
              <div className="relative w-[80vw] h-[80vw] max-w-[380px] max-h-[380px] shadow-2xl rounded-2xl overflow-hidden">
                <img
                  src={song.coverUrl}
                  alt="cover"
                  className="w-full h-full object-cover rounded-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/25 to-transparent pointer-events-none rounded-2xl" />
                {hasLyrics && (
                  <div
                    className="absolute inset-x-4 flex justify-center"
                    style={{ top: `${coverLyricPos * 100}%`, transform: 'translateY(-50%)' }}
                  >
                    <div className="relative w-full max-w-[90%]">
                      <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />
                      <div ref={coverTextWrapperRef} className="relative inline-flex items-center px-4 py-1.5 rounded-2xl bg-black/45 backdrop-blur-sm overflow-hidden max-w-full">
                        <span
                          className="absolute left-0 top-0 h-full rounded-2xl bg-white/10 transition-all duration-100 ease-linear"
                          style={{ width: `${activeLineProgress}%` }}
                        />
                        <span
                          ref={coverTextInnerRef}
                          className="relative z-10 pr-3 text-sm font-semibold text-white whitespace-nowrap inline-block"
                        >
                          {lyricsLines[activeLyricIndex]?.text}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="swiper-no-swiping lyrics-container h-full w-full px-6 overflow-y-auto no-scrollbar flex flex-col items-center text-center mask-image-gradient"
              onScroll={handleLyricScroll}
              onClick={(e) => e.stopPropagation()}
            >
              <div ref={lyricScrollRef} className="w-full space-y-8 py-[60%] transition-all">
                {hasLyrics ? (
                  lyricsLines.map((line, i) => (
                    <p key={i}
                      className={`relative text-base leading-7 transition-all duration-300 cursor-pointer px-3 py-3 rounded-xl overflow-hidden w-full ${i === activeLyricIndex ? 'text-white text-2xl font-bold scale-105 bg-white/5' : 'text-white/40 hover:text-white/70'}`}
                      onClick={(e) => { e.stopPropagation(); unifiedSeek(line.time); }}
                    >
                      {i === activeLyricIndex && (
                        <span className="relative inline-block">
                          <span
                            className="absolute left-0 right-2 top-[-10%] h-[120%] rounded-full transition-all duration-100 ease-linear"
                            style={activeLineBarStyle}
                          />
                          <span className="relative z-10">{line.text}</span>
                        </span>
                      )}
                      {i !== activeLyricIndex && <span className="relative z-10">{line.text}</span>}
                    </p>
                  ))
                ) : (
                  <p className="text-white/50 text-base font-medium py-6">暂无歌词/纯音乐</p>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            {isVideoFullscreen && (
              <button
                onClick={exitFullscreen}
                className="absolute top-4 right-4 z-30 px-3 py-2 rounded-full bg-black/60 text-white text-xs font-bold border border-white/10 active:scale-95"
              >
                退出横屏
              </button>
            )}
            {song.mvUrl && isActiveSlide ? (
              <video
                ref={videoRef}
                src={song.mvUrl}
                className={`w-full max-h-full object-contain ${isVideoFullscreen ? 'h-full' : ''}`}
                playsInline
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                autoPlay={isPlaying}
                onEnded={() => setVideoState(prev => ({ ...prev, isPlaying: false }))}
                controls={false}
                 poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
              />
            ) : (
              <div className="flex flex-col items-center text-white/50">
                <Tv size={48} className="mb-2 opacity-50" />
                <p className="text-xs">{song.mvUrl ? '滑动至此页播放' : '正在搜索 MV 资源...'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部控制区 */}
      <div className={`relative z-20 flex-none w-full pb-8 px-6 bg-gradient-to-t from-black via-black/60 to-transparent pt-6 ${isVideoFullscreen ? 'hidden' : ''}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex-1 mr-4 overflow-hidden cursor-pointer" onClick={toggleLyricsDisplay}>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white truncate leading-tight active:opacity-70 transition-opacity">{song.title}</h2>
              <span className={`text-[9px] font-bold px-1 rounded border flex-shrink-0 ${isSQ ? 'text-yellow-500 border-yellow-500/50' : 'text-indigo-400 border-indigo-400/50'}`}>
                {quality}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-1">
              {song.artist}
            </p>
          </div>
          <div className="flex gap-4">
            {song.mvUrl && viewMode === 'video' && (
              <button
                onClick={handleLandscapePlay}
                className="text-white/60 hover:text-white transition-transform active:scale-110 disabled:opacity-50"
              >
                <Maximize2 size={24} />
              </button>
            )}
            {/* ✅ 下载按钮逻辑，根据 viewMode 决定下载音乐还是 MV */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (viewMode === 'video') {
                  songActions.handleDownload(song, 'video');
                } else {
                  songActions.handleDownload(song, 'music');
                }
              }}
              disabled={isDownloading}
              className="text-white/60 hover:text-white transition-transform active:scale-110 disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />}
            </button>
            <button
              onClick={handleFavorite}
              className={`transition-transform active:scale-110 ${isFavorite ? 'text-red-500' : 'text-white/60'}`}
            >
              <Heart size={24} className={isFavorite ? 'fill-current' : ''} />
            </button>
              <button
              onClick={() => setActionOpen(true)}
              className="transition-transform active:scale-110 text-white/60"
            >
              <MoreVertical size={24} />
            </button>
          </div>
        </div>

        <div className="w-full mb-6 group cursor-pointer relative py-2 swiper-no-swiping">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full relative" style={{ width: `${(currentProgress / (currentDuration || 1)) * 100}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={currentDuration || 100}
            value={currentProgress}
            onChange={(e) => unifiedSeek(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-white/50 mt-2 font-mono font-medium">
            <span>{formatTime(currentProgress)}</span>
            <span>{formatTime(currentDuration)}</span>
          </div>
        </div>

        {/* 核心按钮 (统一控制) */}
        <div className="flex items-center justify-between">
          <button onClick={() => setMode(mode === 'sequence' ? 'shuffle' : mode === 'shuffle' ? 'repeat' : 'sequence')} className="p-2 text-white/80 transition-transform active:scale-110">
            {mode === 'shuffle' ? <Shuffle size={22} /> : mode === 'repeat' ? <Repeat1 size={22} /> : <Repeat size={22} />}
          </button>

          <button onClick={onPrev} className="p-2 text-white transition-transform active:scale-110">
            <ChevronLeft size={32} />
          </button>

          <button
            onClick={unifiedTogglePlay}
            disabled={controlsLocked}
            className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {currentIsPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>

          <button onClick={onNext} className="p-2 text-white transition-transform active:scale-110">
            <ChevronRight size={32} />
          </button>

          <button onClick={() => setShowQueue(true)} className="p-2 text-white/80 transition-transform active:scale-110">
            <ListMusic size={24} />
          </button>
        </div>
      </div>

      {showQueue && (
        <div className="absolute inset-0 bg-black/60 z-[100] flex flex-col justify-end swiper-no-swiping" onClick={() => setShowQueue(false)}>
          <div
            className=" bg-[#121212] rounded-t-3xl p-6 max-h-[70vh] flex flex-col w-full shadow-2xl border-t border-white/5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-white font-bold text-lg">当前播放 <span className="text-white/50 text-sm">({playlist.length})</span></h3>
                <p className="text-xs text-white/40 mt-0.5">{mode === 'sequence' ? '顺序播放' : mode === 'shuffle' ? '随机播放' : '单曲循环'}</p>
              </div>
              <button onClick={() => setShowQueue(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
              {playlist.map((s, idx) => {
                const isCurrent = s.id === song.id;
                return (
                  <div key={`${s.id}_${idx}`}
                    className={`flex items-center p-3 rounded-xl cursor-pointer group ${isCurrent ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
                    onClick={() => onPlayFromQueue(s)}
                  >
                    {isCurrent && <Volume2 size={16} className="text-indigo-400 mr-3 animate-pulse" />}
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium truncate ${isCurrent ? 'text-indigo-300' : 'text-white'}`}>{s.title}</h4>
                      <p className="text-xs text-white/40 truncate">{s.artist}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(s.id); }}
                      className="p-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PlaySettingsSheet
        open={showPlaySettings}
        onClose={() => setShowPlaySettings(false)}
        settings={playSettings}
        onToggle={togglePlaySetting}
        onManualMatchMeta={handleManualMatchMeta}
        onManualHiRes={handleManualHiRes}
        onLayoutChange={handleLayoutChange}
      />

      <SongActionSheet
        song={song}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onAddToFavorites={async (s) => {
          const res = await songActions.handleAddToFavorites(s);
          if (typeof res === 'boolean') setIsFavorite(res);
          return res;
        }}
        onAddToQueue={songActions.handleAddToQueue}
        onAddToNext={songActions.handleAddToNext}
        onAddToPlaylist={songActions.handleAddToPlaylist}
        onCreatePlaylistAndAdd={songActions.handleCreatePlaylistAndAdd}
        onDownloadMusic={(s) => songActions.handleDownload(s, 'music')}

        // ✅ 在 Playing 页点击 MV，只需切换模式即可
        onPlayMv={() => setViewMode('video')}
      />
    </div>
  );
};

export default Playing;