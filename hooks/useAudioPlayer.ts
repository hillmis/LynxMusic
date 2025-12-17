import { useCallback, useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { fetchSongDetail } from '../utils/api';
import { addListenRecord } from '../utils/db';

type Mode = 'sequence' | 'shuffle' | 'repeat';

export const useAudioPlayer = () => {
    // 所有 hooks 必须在顶层无条件调用
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [playlist, setPlaylist] = useState<Song[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    const [mode, setMode] = useState<Mode>('sequence');

    // 统计：当前歌曲播放会话
    const statRef = useRef({
        songId: '' as string,
        startedAt: 0,
        lastTick: 0,
        played: 0,
    });

    const resetStat = () => {
        statRef.current = { songId: '', startedAt: 0, lastTick: 0, played: 0 };
    };

    const flushStat = useCallback(async () => {
        const s = statRef.current;
        if (!currentSong) return;
        if (!s.songId || s.songId !== currentSong.id) return;

        const played = Math.floor(s.played);
        if (played >= 3) {
            await addListenRecord(currentSong, played);
        }
        resetStat();
    }, [currentSong]);

    const beginStat = (song: Song) => {
        const now = Date.now();
        statRef.current.songId = song.id;
        statRef.current.startedAt = now;
        statRef.current.lastTick = now;
        statRef.current.played = 0;
    };

    // --- 核心播放逻辑 ---
    const executePlay = useCallback(async (song: Song) => {
        // 切歌前落库统计
        if (currentSong && currentSong.id !== song.id) {
            await flushStat();
        }

        setIsLoading(true);

        let target: Song = { ...song };
        try {
            // 如果详情未加载或没有播放链接，尝试获取
            if (!target.url || !target.isDetailsLoaded) {
                target = await fetchSongDetail(target);
            }

            if (!target.url) {
                console.warn('无播放链接:', target.title);
                setIsLoading(false);
                return;
            }

            setCurrentSong(target);
            setIsPlaying(true);
            setIsLoading(false);

            // 替换 playlist 内同 id 的对象
            setPlaylist(prev => prev.map(s => (s.id === target.id ? target : s)));

            // 设置音频源并播放
            const audio = audioRef.current!;
            if (audio.src !== target.url) {
                audio.src = target.url;
                audio.load();
            }

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error('自动播放被拦截或失败:', error);
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

            if (isPlaying && currentSong && statRef.current.songId === currentSong.id) {
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
        });

        return () => {
            // 清理函数
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // ✅ 动态绑定 ended 事件
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

    // 控制函数
    const playSong = (song: Song) => {
        if (currentSong?.id === song.id) {
            togglePlay();
            return;
        }

        setPlaylist(prev => {
            const idx = prev.findIndex(s => s.id === song.id);
            if (idx !== -1) {
                setCurrentIndex(idx);
                executePlay(prev[idx]);
                return prev;
            }

            const next = [...prev];
            if (next.length === 0) {
                next.push(song);
                setCurrentIndex(0);
                executePlay(song);
            } else {
                const insertAt = currentIndex + 1;
                next.splice(insertAt, 0, song);
                setCurrentIndex(insertAt);
                executePlay(song);
            }
            return next;
        });
    };

    const playList = (songs: Song[], startIndex = 0) => {
        if (!songs || songs.length === 0) return;
        setPlaylist(songs);
        setCurrentIndex(startIndex);
        executePlay(songs[startIndex]);
    };

    const addToQueue = (song: Song) => {
        setPlaylist(prev => {
            if (prev.some(s => s.id === song.id)) return prev;
            return [...prev, song];
        });
        window.webapp?.toast?.('已添加到队列');
    };

    const addAllToQueue = (songs: Song[]) => {
        setPlaylist(prev => {
            const map = new Map(prev.map(s => [s.id, s]));
            songs.forEach(s => { if (!map.has(s.id)) map.set(s.id, s); });
            return Array.from(map.values());
        });
        window.webapp?.toast?.('已添加到队列');
    };

    const togglePlay = async () => {
        if (!currentSong) return;
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
        addAllToQueue,

        setProgress: setProgressHandler,
        updateSongInPlaylist,
        removeFromQueue,
    };
};