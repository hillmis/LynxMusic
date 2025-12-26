import React, { useEffect, useRef, useMemo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Virtual } from 'swiper/modules';
import { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import 'swiper/css/virtual';

import Playing from '../pages/Playing';
import { Song } from '../types';
import { fetchSongDetail } from '../utils/api';

interface PlayerSwiperProps {
    currentSong?: Song;
    playlist?: Song[];
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
    onUpdateSong: (song: Song) => void;
    onAddToQueue: (song: Song) => void;
    onAddToNext: (song: Song) => void;
    // 新增：支持两种视图模式切换
    viewMode: 'music' | 'video';
    setViewMode: (mode: 'music' | 'video') => void;
    controlsLocked: boolean;
    variant?: 'overlay' | 'panel';
}

const PlayerSwiper: React.FC<PlayerSwiperProps> = ({
    currentSong,
    playlist = [],
    isPlaying,
    progress,
    duration,
    mode,
    setMode,
    onClose,
    onTogglePlay,
    onNext,
    onPrev,
    onSeek,
    onPlayFromQueue,
    onRemoveFromQueue,
    onUpdateSong,
    onAddToQueue,
    onAddToNext,
    viewMode,      // 新增
    setViewMode,   // 新增
    controlsLocked,
    variant = 'overlay',
}) => {
    const swiperRef = useRef<SwiperType | null>(null);

    const activeIndex = useMemo(() => {
        if (!currentSong || playlist.length === 0) return 0;
        const idx = playlist.findIndex(s => s.id === currentSong.id);
        return idx >= 0 ? idx : 0;
    }, [currentSong, playlist]);

    // 确保 Swiper 同步位置
    useEffect(() => {
        if (!swiperRef.current) return;
        if (swiperRef.current.activeIndex !== activeIndex) {
            swiperRef.current.slideTo(activeIndex, 0);
        }
    }, [activeIndex]);

    const handleSlideChange = async (swiper: SwiperType) => {
        const newIndex = swiper.activeIndex;
        const song = playlist[newIndex];
        if (!song || !currentSong) return;

        // 滑动切换歌曲时自动播放
        if (song.id !== currentSong.id) {
            onPlayFromQueue(song);

            // 注意：滑动切换时强制设为 music 视图模式
            // Playing.tsx 中会根据歌曲是否有 MV 链接自动判断显示 MV 按钮
            // 但默认进入 music 视图
        }

        preloadAround(newIndex);
    };

    const preloadAround = async (index: number) => {
        const indices = [index - 1, index + 1];

        for (const i of indices) {
            const song = playlist[i];
            if (!song) continue;

            if (!song.url || !song.isDetailsLoaded) {
                try {
                    const detailed = await fetchSongDetail(song);
                    if (detailed?.id === song.id) {
                        onUpdateSong(detailed);
                    }
                } catch (e) {
                    console.warn('预加载失败', e);
                }
            }
        }
    };

    if (!currentSong || playlist.length === 0) {
        return null;
    }

    const containerClass = variant === 'overlay'
        ? 'fixed inset-0 z-50 bg-black'
        : 'absolute inset-0 bg-black';

    return (
        <div className={containerClass}>
            <Swiper
                modules={[Virtual]}
                direction="vertical"
                className="w-full h-full"
                initialSlide={activeIndex}
                onSwiper={(swiper) => (swiperRef.current = swiper)}
                onSlideChange={handleSlideChange}
                virtual={{
                    enabled: true,
                    addSlidesBefore: 1,
                    addSlidesAfter: 1,
                }}
                threshold={15}
                resistance={true}
                resistanceRatio={0.65}
                speed={500}
                noSwiping={true}
                noSwipingClass="swiper-no-swiping"
                touchRatio={1.0}
                followFinger={true}
            >
                {playlist.map((song, index) => (
                    <SwiperSlide
                        key={`${song.id}-${index}`}
                        virtualIndex={index}
                        className="w-full h-full"
                    >
                        {({ isActive }) => (
                            <Playing
                                song={song}
                                isPlaying={isActive ? isPlaying : false}
                                playlist={playlist}
                                progress={isActive ? progress : 0}
                                duration={isActive ? duration : 0}
                                mode={mode}
                                setMode={setMode}
                                onClose={onClose}
                                onTogglePlay={onTogglePlay}
                                onNext={onNext}
                                onPrev={onPrev}
                                onSeek={onSeek}
                                onPlayFromQueue={onPlayFromQueue}
                                onRemoveFromQueue={onRemoveFromQueue}
                                isActiveSlide={isActive}
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                onAddToQueue={onAddToQueue}
                                onAddToNext={onAddToNext}
                                controlsLocked={controlsLocked}
                            />
                        )}
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
};

export default PlayerSwiper;
