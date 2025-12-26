import { useCallback, useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { fetchSongDetail } from '../utils/api';
import { addListenRecord } from '../utils/db';
import { safeToast, getNative } from '../utils/fileSystem';

type Mode = 'sequence' | 'shuffle' | 'repeat';

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.3gp', '.webm', '.mov'];
const isVideoSource = (song?: Song | null) => {
    if (!song) return false;
    const link = (song.mvUrl || song.url || song.path || '').toLowerCase();
    return VIDEO_EXTS.some(ext => link.endsWith(ext));
};

// 统一兜底：从 path 或 file://url 中构造可播放的本地地址
const toSafeFileUrl = (raw?: string) => {
    if (!raw) return '';
    const clean = raw.startsWith('file://') ? raw.replace(/^file:\/\//, '') : raw;
    return `file://${encodeURI(clean)}`;
};

const getExt = (val?: string) => {
    if (!val) return '';
    const clean = val.split('?')[0].split('#')[0];
    const m = clean.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
};

const normalizeSongForPlayback = (song: Song): Song => {
    const localUrl = song.path
        ? toSafeFileUrl(song.path)
        : (song.url?.startsWith('file://') ? toSafeFileUrl(song.url) : '');
    const preferLocal = !!localUrl && (song.source === 'local' || song.source === 'download' || !song.url);
    const resolvedUrl = preferLocal ? localUrl : (song.url || localUrl);

    return {
        ...song,
        url: resolvedUrl,
        isDetailsLoaded: song.isDetailsLoaded || preferLocal,
    };
};

export const useAudioPlayer = () => {
    // 所有 hooks 必须在顶层无条件调用
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const nativeRef = useRef(getNative());
    const localUrlCache = useRef<Record<string, string>>({});

    const [playlist, setPlaylist] = useState<Song[]>([]);
    const playlistRef = useRef<Song[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const currentIndexRef = useRef<number>(-1);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    const [mode, setMode] = useState<Mode>('sequence');
    const fallbackTriedRef = useRef<string | null>(null);
    const currentSongRef = useRef<Song | null>(null);
    const isPlayingRef = useRef(false);

    useEffect(() => {
        currentSongRef.current = currentSong;
    }, [currentSong]);

    useEffect(() => {
        playlistRef.current = playlist;
    }, [playlist]);

    useEffect(() => {
        currentIndexRef.current = currentIndex;
    }, [currentIndex]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // 统计：当前歌曲播放会计数
    const statRef = useRef({
        songId: '' as string,
        startedAt: 0,
        lastTick: 0,
        played: 0,
        sessionId: '' as string,
    });

    const resetStat = () => {
        statRef.current = { songId: '', startedAt: 0, lastTick: 0, played: 0, sessionId: '' };
    };

    const flushStat = useCallback(async () => {
        const s = statRef.current;
        if (!currentSong) return;
        if (!s.songId || s.songId !== currentSong.id) return;

        const played = Math.floor(s.played);
        if (played >= 3) {
            await addListenRecord(currentSong, played, s.startedAt || Date.now(), s.sessionId || undefined);
        }
        resetStat();
    }, [currentSong]);

    const beginStat = (song: Song) => {
        const now = Date.now();
        statRef.current.songId = song.id;
        statRef.current.startedAt = now;
        statRef.current.lastTick = now;
        statRef.current.played = 0;
        statRef.current.sessionId = `${now}_${song.id}`;
    };

    const buildDataUrl = (raw: string) => raw.startsWith('data:') ? raw : `data:audio/mpeg;base64,${raw}`;

    const loadLocalAudioUrl = async (song: Song): Promise<string | null> => {
        const keyRaw = song.path || song.url || '';
        if (!keyRaw) return null;
        const key = keyRaw.startsWith('file://') ? decodeURI(keyRaw.replace(/^file:\/\//, '')) : keyRaw;
        if (localUrlCache.current[key]) return localUrlCache.current[key];

        try {
            const native = nativeRef.current || getNative();
            const raw = native?.file?.read?.(key) ?? native?.gainfile?.(key);
            if (!raw) return null;
            const dataUrl = buildDataUrl(raw);
            localUrlCache.current[key] = dataUrl;
            return dataUrl;
        } catch (err) {
            console.warn('读取本地文件失败', err);
            return null;
        }
    };

    const loadLocalVideoUrl = async (song: Song): Promise<string | null> => {
        const keyRaw = song.path || song.mvUrl || song.url || '';
        if (!keyRaw) return null;
        const key = keyRaw.startsWith('file://') ? decodeURI(keyRaw.replace(/^file:\/\//, '')) : keyRaw;
        if (localUrlCache.current[key]) return localUrlCache.current[key];

        try {
            const native = nativeRef.current || getNative();
            const raw = native?.file?.read?.(key) ?? native?.gainfile?.(key);
            if (!raw) return null;
            const ext = getExt(key);
            const mimeMap: Record<string, string> = {
                mp4: 'video/mp4',
                mkv: 'video/x-matroska',
                avi: 'video/x-msvideo',
                webm: 'video/webm',
                mov: 'video/quicktime',
                '3gp': 'video/3gpp',
            };
            const mime = mimeMap[ext] || 'video/mp4';
            const dataUrl = raw.startsWith('data:') ? raw : `data:${mime};base64,${raw}`;
            localUrlCache.current[key] = dataUrl;
            return dataUrl;
        } catch (err) {
            console.warn('读取本地视频失败', err);
            return null;
        }
    };

    // --- 核心播放逻辑 ---
    const executePlay = useCallback(async (song: Song) => {
        // 切歌前落库统计
        if (currentSong && currentSong.id !== song.id) {
            await flushStat();
        }

        setIsLoading(true);

        let target: Song = normalizeSongForPlayback(song);
        const isVideo = isVideoSource(target);
        try {
            // 如果详情未加载或没有播放链接，尝试获取
            if (!isVideo && (!target.url || !target.isDetailsLoaded) && target.source !== 'local' && !target.path) {
                target = await fetchSongDetail(target);
            }

            if (isVideo && (target.source === 'local' || target.mvUrl?.startsWith('file://') || target.path)) {
                const localVideoUrl = await loadLocalVideoUrl(target);
                if (localVideoUrl) {
                    target = { ...target, mvUrl: localVideoUrl, url: localVideoUrl, isDetailsLoaded: true };
                } else if (target.path) {
                    const fallbackUrl = toSafeFileUrl(target.path);
                    target = { ...target, mvUrl: target.mvUrl || fallbackUrl, url: target.url || fallbackUrl };
                }
            }

            // 本地播放：优先通过 webapp 读取文件内容生成 dataURL
            if (!isVideo && (target.source === 'local' || target.url?.startsWith('file://') || target.path)) {
                const localUrl = await loadLocalAudioUrl(target);
                if (localUrl) {
                    target = { ...target, url: localUrl, isDetailsLoaded: true };
                }
            }

            if (!target.url && !isVideo) {
                console.warn('无播放链接', target.title);
                setIsLoading(false);
                return;
            }

            setCurrentSong(target);
            setIsPlaying(true);
            setIsLoading(false);

            setPlaylist(prev => prev.map(s => (s.id === target.id ? target : s)));

            // Keep playlist entry in sync
            // Video source is handled by the in-player video element
            if (isVideo) {
                setProgress(0);
                setDuration(target.duration || 0);
                beginStat(target);
                return;
            }

            // Set audio source and play
            const audio = audioRef.current!;
            if (audio.src !== target.url) {
                audio.src = target.url;
                audio.load();
            }

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error('自动播放被阻拦或失败:', error);
                    setIsPlaying(false);
                });
            }

            beginStat(target);
        } catch (e) {
            console.error('Play error', e);
            setIsLoading(false);
            setIsPlaying(false);
        }
    }, [currentSong, flushStat]);

    // --- 播放控制函数 ---
    const playNext = useCallback(() => {
        if (playlist.length === 0) return;

        let nextIndex = currentIndex;
        if (mode === 'shuffle') {
            let r = 0;
            do {
                r = Math.floor(Math.random() * playlist.length);
            } while (r === currentIndex && playlist.length > 1);
            nextIndex = r;
        } else {
            nextIndex = (currentIndex + 1) % playlist.length;
        }

        setCurrentIndex(nextIndex);
        executePlay(playlist[nextIndex]);
    }, [playlist, currentIndex, mode, executePlay]);

    const playPrev = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || playlist.length === 0) return;

        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }

        let prevIndex = currentIndex;
        if (mode === 'shuffle') {
            let r = 0;
            do {
                r = Math.floor(Math.random() * playlist.length);
            } while (r === currentIndex && playlist.length > 1);
            prevIndex = r;
        } else {
            prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        }

        setCurrentIndex(prevIndex);
        executePlay(playlist[prevIndex]);
    }, [playlist, currentIndex, mode, executePlay]);

    // 重要：这是为了确保 hook 调用顺序，创建空的 useEffect 放在所有 useCallback 之前
    useEffect(() => {
        // 空的副作用，确保 hook 顺序一致
    }, []);

    // --- Audio 事件监听初始化 ---
    useEffect(() => {
        if (audioRef.current) return;
        audioRef.current = new Audio();

        const audio = audioRef.current;

        audio.addEventListener('loadedmetadata', () => {
            setDuration(audio.duration || 0);
            setIsLoading(false);
        });

        audio.addEventListener('timeupdate', () => {
            setProgress(audio.currentTime || 0);

            const activeSong = currentSongRef.current;
            if (isPlayingRef.current && activeSong && statRef.current.songId === activeSong.id) {
                const now = Date.now();
                const dt = (now - statRef.current.lastTick) / 1000;
                if (dt > 0 && dt < 2) statRef.current.played += dt;
                statRef.current.lastTick = now;
            }
        });

        audio.addEventListener('waiting', () => setIsLoading(true));
        audio.addEventListener('canplay', () => setIsLoading(false));
        audio.addEventListener('error', (e) => {
            console.error('Audio Error:', e);
            setIsLoading(false);
            setIsPlaying(false);
            // 本地文件损坏或缺失时，尝试在线搜索获取
            const activeSong = currentSongRef.current;
            if (activeSong && activeSong.id !== fallbackTriedRef.current) {
                fallbackTriedRef.current = activeSong.id;
                fetchSongDetail({ ...activeSong, url: '', isDetailsLoaded: false }).then((detailed) => {
                    if (detailed.url && detailed.id === activeSong.id) {
                        executePlay(detailed);
                    }
                }).catch(() => { });
            }
        });

        return () => {
            // 清理函数
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // 动态绑定 ended 事件
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = async () => {
            await flushStat();
            if (mode === 'repeat') {
                audio.currentTime = 0;
                audio.play();
                if (currentSong) beginStat(currentSong);
            } else {
                playNext();
            }
        };

        audio.addEventListener('ended', handleEnded);
        return () => {
            audio.removeEventListener('ended', handleEnded);
        };
    }, [mode, playNext, flushStat, currentSong]);

    // 同步播放/暂停状态
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentSong?.url) return;

        if (isPlaying) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => setIsPlaying(false));
            }
        } else {
            audio.pause();
        }
    }, [isPlaying, currentSong]);

    // 定时落库，防止长时间播放未切歌时只记录一次
    useEffect(() => {
        if (!isPlaying || !currentSong) return;

        const timer = setInterval(() => {
            const s = statRef.current;
            if (!s.songId || s.songId !== currentSong.id) return;
            const played = Math.floor(s.played);
            if (played >= 3) {
                addListenRecord(currentSong, played, s.startedAt || Date.now(), s.sessionId || undefined);
            }
        }, 15000); // 每15秒尝试一次

        return () => clearInterval(timer);
    }, [isPlaying, currentSong]);

    // Flush listen duration when page is hidden/unloaded to avoid losing the last few seconds
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) flushStat();
        };
        const handlePageHide = () => flushStat();

        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            window.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
            flushStat();
        };
    }, [flushStat]);

    // 控制函数
    const playSong = (song: Song) => {
        if (currentSong?.id === song.id) {
            togglePlay();
            return;
        }

        setPlaylist(prev => {
            const idx = prev.findIndex(s => s.id === song.id);
            if (idx !== -1) {
                const updated = prev.map((s, i) => i === idx ? normalizeSongForPlayback(s) : s);
                setCurrentIndex(idx);
                executePlay(updated[idx]);
                return updated;
            }

            const next = [...prev];
            if (next.length === 0) {
                const normalized = normalizeSongForPlayback(song);
                next.push(normalized);
                setCurrentIndex(0);
                executePlay(normalized);
            } else {
                const insertAt = currentIndex + 1;
                const normalized = normalizeSongForPlayback(song);
                next.splice(insertAt, 0, normalized);
                setCurrentIndex(insertAt);
                executePlay(normalized);
            }
            return next;
        });
    };

    const playList = (songs: Song[], startIndex = 0) => {
        if (!songs || songs.length === 0) return;
        const normalized = songs.map(normalizeSongForPlayback);
        setPlaylist(normalized);
        setCurrentIndex(startIndex);
        executePlay(normalized[startIndex]);
    };

    const addToQueue = (song: Song) => {
        setPlaylist(prev => {
            if (prev.some(s => s.id === song.id)) return prev;
            return [...prev, normalizeSongForPlayback(song)];
        });
        safeToast('已添加到队列');
    };

    const addToNext = (song: Song) => {
        setPlaylist(prev => {
            if (prev.some(s => s.id === song.id)) {
                safeToast('歌曲已在队列中');
                return prev;
            }

            if (prev.length === 0) {
                setCurrentIndex(0);
                const normalized = normalizeSongForPlayback(song);
                const nextList = [normalized];
                executePlay(normalized);
                return nextList;
            }

            const next = [...prev];
            const safeIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : -1;

            if (safeIndex < 0) {
                // 没有正在播放的歌曲时，直接在末尾播放
                const normalized = normalizeSongForPlayback(song);
                next.push(normalized);
                setCurrentIndex(next.length - 1);
                executePlay(normalized);
                return next;
            }

            const insertAt = Math.min(safeIndex + 1, next.length);
            next.splice(insertAt, 0, normalizeSongForPlayback(song));
            // 保持当前播放不变，仅在队列中排到当前曲目的下一位
            return next;
        });
        safeToast('已设为下一首播放');
    };

    // 获取当前播放位置（索引、歌曲、队列快照）
    const getCurrentPosition = () => ({
        index: currentIndexRef.current,
        song: currentSongRef.current,
        playlist: [...playlistRef.current],
    });

    const addAllToQueue = (songs: Song[]) => {
        setPlaylist(prev => {
            const map = new Map(prev.map(s => [s.id, s]));
            songs.forEach(s => {
                if (!map.has(s.id)) map.set(s.id, normalizeSongForPlayback(s));
            });
            return Array.from(map.values());
        });
        safeToast('已添加到队列');
    };

    const togglePlay = async () => {
        if (!currentSong) return;
        const videoMode = isVideoSource(currentSong);
        if (videoMode) {
            // 视频播放交由视频元素控制，这里只同步状态和统计
            if (isPlaying) {
                await flushStat();
            } else {
                beginStat(currentSong);
            }
            setIsPlaying(!isPlaying);
            return;
        }
        if (isPlaying) {
            await flushStat();
            setIsPlaying(false);
        } else {
            beginStat(currentSong);
            setIsPlaying(true);
        }
    };

    const setProgressHandler = (val: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = val;
        setProgress(val);
    };

    const removeFromQueue = (songId: string) => {
        setPlaylist(prev => {
            const newPlaylist = prev.filter(s => s.id !== songId);
            if (newPlaylist.length === 0) {
                setIsPlaying(false);
                setCurrentSong(null);
                setCurrentIndex(-1);
            }
            return newPlaylist;
        });
    };

    const updateSongInPlaylist = (updatedSong: Song) => {
        setPlaylist(prev => prev.map(s => (s.id === updatedSong.id ? updatedSong : s)));
        if (currentSong?.id === updatedSong.id) setCurrentSong(updatedSong);
    };

    return {
        currentSong,
        playlist,
        currentIndex,
        isPlaying,
        isLoading,
        progress,
        duration,
        mode,
        setMode,

        togglePlay,
        playNext,
        playPrev,
        playSong,
        playList,

        addToQueue,
        addToNext,
        addAllToQueue,

        setProgress: setProgressHandler,
        updateSongInPlaylist,
        removeFromQueue,
        getCurrentPosition,
    };
};
