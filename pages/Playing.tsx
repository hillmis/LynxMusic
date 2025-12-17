
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Song } from '../types';
import {
  ChevronDown, Play, Pause, Repeat, Repeat1, Shuffle, Heart, ListMusic,
  MoreHorizontal, Tv, Music, X, Volume2, Trash2, Download, Loader2,
  ChevronLeft, ChevronRight, Maximize2
} from 'lucide-react';
import 'swiper/css';
import { useSongActions } from '../hooks/useSongActions';
import SongActionSheet from '../components/SongActionSheet';
import { fetchMusicVideo } from '../utils/api';
import { isSongInFavorites } from '../utils/playlistStore';

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
}

const Playing: React.FC<PlayingProps> = ({
  song, playlist, isPlaying, progress, duration, mode, setMode,
  onClose, onTogglePlay, onNext, onPrev, onSeek,
  onPlayFromQueue, onRemoveFromQueue, isActiveSlide,
  viewMode, setViewMode,
  onAddToQueue
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [coverLyricPos, setCoverLyricPos] = useState<number>(0.5);


  const scrollToActiveLyric = (behavior: ScrollBehavior = 'smooth') => {
    if (!lyricScrollRef.current) return;
    const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior, block: 'center' });
    }
  };

  // 定义 quality 和 isSQ 变量
  const quality = song.quality || 'SQ';
  const isSQ = quality === 'SQ' || quality === 'HR';

  const songActions = useSongActions({ addToQueue: onAddToQueue });
  const [actionOpen, setActionOpen] = useState(false);

  const [lyricsLines, setLyricsLines] = useState<{ time: number, text: string }[]>([]);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const lyricScrollRef = useRef<HTMLDivElement>(null);

  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 视频专用
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0
  });

  // MV 自动获取逻辑
  useEffect(() => {
    if (viewMode === 'video' && isActiveSlide && !song.mvUrl) {
      fetchMusicVideo(song.title).then((url) => {
        if (url) {
          song.mvUrl = url;
          // 可以在这里强制刷新一下，或者由于 song 属性变更自动触发重绘
        } else {
          window.webapp?.toast?.('未找到该歌曲的 MV');
          setViewMode('music'); // 没找到自动切回音乐
        }
      });
    }
  }, [viewMode, isActiveSlide, song]);

  useEffect(() => {
    if (!song?.id) {
      setIsFavorite(false);
      return;
    }
    isSongInFavorites(song.id).then(setIsFavorite);
    const positions = [2 / 7, 4 / 7, 6 / 7];
    setCoverLyricPos(positions[Math.floor(Math.random() * positions.length)]);
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
    if (song.lyrics) {
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
      setLyricsLines([{ time: 0, text: '暂无歌词 / 纯音乐' }]);
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

  const handleLandscapePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = videoRef.current;
    if (!target) return;
    try {
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

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* 动态模糊背景 */}
      <div className="absolute inset-0 z-0">
        <img src={song.coverUrl} alt="bg" className="w-full h-full object-cover opacity-80 blur-3xl scale-125 transition-opacity duration-700" />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* 顶部导航 */}
      <div className="relative z-20 flex items-center justify-between px-4 py-4 mt-safe-top">
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
          onClick={() => setActionOpen(true)}
          className="p-2 text-slate-300 hover:text-white rounded-full transition-transform active:scale-110"
        >
          <MoreHorizontal size={24} />
        </button>
      </div>

      {/* 中间内容区 */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full overflow-hidden min-h-0" onClick={toggleLyricsDisplay}>
        {viewMode === 'music' ? (
          !showLyrics ? (
            <div className="w-full flex items-center justify-center animate-in zoom-in duration-500 px-6">
              <div className="relative w-[70vw] h-[70vw] max-w-[380px] max-h-[380px] shadow-2xl rounded-2xl overflow-hidden">
                <img
                  src={song.coverUrl}
                  alt="cover"
                  className="w-full h-full object-cover rounded-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/25 to-transparent pointer-events-none rounded-2xl" />
                <div
                  className="absolute inset-x-4 flex justify-center"
                  style={{ top: `${coverLyricPos * 100}%`, transform: 'translateY(-50%)' }}
                >
                  <div className="relative w-full max-w-[85%]">
                    <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />
                    <div className="relative inline-flex items-center px-4 py-1.5 rounded-2xl bg-black/45 backdrop-blur-sm overflow-hidden max-w-full">
                      <span
                        className="absolute left-0 top-0 h-full rounded-2xl bg-white/10 transition-all duration-100 ease-linear"
                        style={{ width: `${activeLineProgress}%` }}
                      />
                      <span className="relative z-10 text-xs font-semibold text-white line-clamp-2 whitespace-nowrap">
                        {lyricsLines[activeLyricIndex]?.text || '暂无歌词'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="swiper-no-swiping lyrics-container h-full w-full px-6 overflow-y-auto no-scrollbar flex flex-col items-center text-center mask-image-gradient"
              onScroll={handleLyricScroll}
              onClick={(e) => e.stopPropagation()}
            >
              <div ref={lyricScrollRef} className="w-full space-y-8 py-[60%] transition-all">
                {lyricsLines.map((line, i) => (
                  <p key={i}
                    className={`relative text-base leading-7 transition-all duration-300 cursor-pointer px-3 py-3 rounded-xl overflow-hidden w-full ${i === activeLyricIndex ? 'text-white text-2xl font-bold scale-105 bg-white/5' : 'text-white/40 hover:text-white/70'}`}
                    onClick={(e) => { e.stopPropagation(); unifiedSeek(line.time); }}
                  >
                    {i === activeLyricIndex && (
                      <span className="relative inline-block">
                        <span
                          className="absolute left-0 top-[-10%] h-[120%] rounded-full transition-all duration-100 ease-linear"
                          style={activeLineBarStyle}
                        />
                        <span className="relative z-10">{line.text}</span>
                      </span>
                    )}
                    {i !== activeLyricIndex && <span className="relative z-10">{line.text}</span>}
                  </p>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center  backdrop-blur-sm shadow-2xl relative z-30">
            {song.mvUrl && isActiveSlide ? (
              <video
                ref={videoRef}
                src={song.mvUrl}
                className="w-full max-h-full object-contain"
                playsInline
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                autoPlay={isPlaying}
                onEnded={() => setVideoState(prev => ({ ...prev, isPlaying: false }))}
                controls={false}
                poster=""
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
      <div className="relative z-20 flex-none w-full pb-8 px-6 bg-gradient-to-t from-black via-black/60 to-transparent pt-6">
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
            {/* ✅ 修复：下载按钮逻辑，根据 viewMode 决定下载音乐还是 MV */}
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
            className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
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
            className=" bg-slate-900 rounded-t-3xl p-6 max-h-[70vh] flex flex-col w-full shadow-2xl border-t border-white/5"
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

      <SongActionSheet
        song={song}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onAddToFavorites={songActions.handleAddToFavorites}
        onAddToQueue={songActions.handleAddToQueue}
        onAddToPlaylist={songActions.handleAddToPlaylist}
        onCreatePlaylistAndAdd={songActions.handleCreatePlaylistAndAdd}
        onDownloadMusic={(s) => songActions.handleDownload(s, 'music')}

        // ✅ 修复：在 Playing 页点击 MV，只需切换模式即可
        onPlayMv={() => setViewMode('video')}
      />
    </div>
  );
};

export default Playing;
