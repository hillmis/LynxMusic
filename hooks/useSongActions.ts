import { useState } from 'react';
import { Song } from '../types';
import { getUserPlaylists, addSongToPlaylist, createUserPlaylist, FAVORITE_PLAYLIST_TITLE, isSongInFavorites, removeSongFromFavorites, removeSongFromPlaylist } from '../utils/playlistStore';
import { safeToast } from '../utils/fileSystem';
import { createDownloadTask, startDownloadQueue } from '../utils/downloadManager';
import { fetchSongDetail, fetchMusicVideo } from '../utils/api';
import { DOWNLOAD_COST, consumeDownloadChance, getDownloadChances, getPointsBalance, hasDownloadPrivilege, redeemDownloadChance } from '../utils/rewards';

type Deps = {
    addToQueue?: (song: Song) => void;
    addToNext?: (song: Song) => void;
    addAllToQueue?: (songs: Song[]) => void;
};

export const useSongActions = (deps: Deps = {}) => {
    const { addToQueue, addToNext, addAllToQueue } = deps;

    const [showSheet, setShowSheet] = useState(false);
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);

    const open = (song: Song) => {
        setSelectedSong(song);
        setShowSheet(true);
    };

    const close = () => setShowSheet(false);

    // --- 辅助：安全的 Toast ---
    const toast = safeToast;

    const getExtensionFromPath = (value?: string | null): string | null => {
        if (!value) return null;
        const clean = value.split('?')[0].split('#')[0];
        const match = clean.match(/\.([a-z0-9]+)$/i);
        return match ? `.${match[1].toLowerCase()}` : null;
    };

    const ensureDownloadOpportunity = (): boolean => {
        if (hasDownloadPrivilege()) {
            return true;
        }

        const available = getDownloadChances();
        if (available > 0) {
            consumeDownloadChance();
            toast?.(`已使用 1 次下载次数，剩余 ${Math.max(0, available - 1)} 次`);
            return true;
        }

        const balance = getPointsBalance();
        if (balance >= DOWNLOAD_COST) {
            const confirmRedeem = window.confirm(`下载需要消耗 1 次下载次数，是否花费 ${DOWNLOAD_COST} 积分兑换？（当前积分 ${balance}）`);
            if (confirmRedeem) {
                const redeemed = redeemDownloadChance();
                if (redeemed.ok) {
                    consumeDownloadChance();
                    toast?.(`已消耗 ${DOWNLOAD_COST} 积分兑换并使用 1 次下载次数`);
                    return true;
                }
                toast?.('兑换失败，请稍后再试');
            }
            return false;
        }

        toast?.('下载次数不足，请前往福利中心完成任务获取积分后兑换下载次数');
        const goCheckIn = () => {
            try {
                window.dispatchEvent(new CustomEvent('hm-open-checkin'));
            } catch { }
        };
        if (window.confirm('下载次数不足，是否前往福利中心获取下载次数？')) {
            goCheckIn();
        }
        return false;
    };

    // --- 单曲操作 ---

    const handleAddToQueue = (song: Song) => {
        if (!addToQueue) {
            toast('播放器未就绪 (队列功能不可用)');
            return;
        }
        addToQueue(song);
        toast('已添加到播放队列');
    };

    const handleAddToNext = (song: Song) => {
        if (!addToNext) {
            toast('播放器未就绪 (下一首功能不可用)');
            return;
        }
        addToNext(song);
    };

    const handleAddToFavorites = async (song: Song): Promise<boolean> => {
        try {
            const playlists = await getUserPlaylists();
            let fav = playlists.find(p => p.title === FAVORITE_PLAYLIST_TITLE);
            if (!fav) fav = await createUserPlaylist(FAVORITE_PLAYLIST_TITLE);

            const already = await isSongInFavorites(song.id);
            if (already) {
                const removed = await removeSongFromFavorites(song.id);
                toast(removed ? '已取消喜欢' : '取消失败');
                return false;
            }

            const ok = await addSongToPlaylist(fav.id, song);
            toast(ok ? `已添加到“${FAVORITE_PLAYLIST_TITLE}”` : '歌曲已在列表');
            return !!ok;
        } catch (e) {
            console.error(e);
            toast('操作失败');
            return false;
        }
    };

    const handleAddToPlaylist = async (playlistId: string, song: Song) => {
        try {
            const playlists = await getUserPlaylists();
            const target = playlists.find(p => p.id === playlistId);
            const exists = target?.songs?.some(s => s.id === song.id);

            if (exists) {
                const removed = await removeSongFromPlaylist(playlistId, song.id);
                toast(removed ? '已移出歌单' : '移出失败');
                return;
            }

            const ok = await addSongToPlaylist(playlistId, song);
            toast(ok ? '已添加到歌单' : '歌曲已在歌单中');
        } catch (e) {
            console.error(e);
            toast('操作失败');
        }
    };

    const handleCreatePlaylistAndAdd = async (title: string, song: Song) => {
        try {
            const pl = await createUserPlaylist(title);
            await addSongToPlaylist(pl.id, song);
            toast('已创建并添加');
            return pl;
        } catch (e) {
            console.error(e);
            toast('创建失败');
            return null;
        }
    };

    // ✅ 修复：完整下载流程
    const handleDownload = async (song: Song, type: 'music' | 'video' = 'music') => {
        const allowed = ensureDownloadOpportunity();
        if (!allowed) return false;

        let targetSong = song;
        // 自动补全播放链接
        if ((type === 'music' && !song.url) || (type === 'video' && !song.mvUrl)) {
            try {
                const detail = await fetchSongDetail(song);
                if (detail) targetSong = { ...song, ...detail };
            } catch { }
            if (type === 'video' && !targetSong.mvUrl) {
                try {
                    const mv = await fetchMusicVideo(song.title || '');
                    if (mv) targetSong = { ...targetSong, mvUrl: mv };
                } catch { }
            }
        }

        const targetUrl = type === 'music' ? targetSong.url : targetSong.mvUrl;
        const fallbackExt = type === 'music' ? '.mp3' : '.mp4';

        if (!targetUrl) {
            toast('没有可下载的地址');
            return false;
        }

        const baseName = `${targetSong.artist || '未知歌手'} - ${targetSong.title || '未知歌曲'}`.trim();
        createDownloadTask({
            type: type === 'video' ? 'mv' : 'song',
            title: baseName,
            artist: targetSong.artist,
            coverUrl: targetSong.coverUrl,
            songId: targetSong.id,
            status: 'pending',
            progress: 0,
            url: targetUrl,
            ext: getExtensionFromPath(targetUrl) || getExtensionFromPath(targetSong.path) || fallbackExt,
            fileName: baseName,
            pathHint: targetSong.path
        });

        toast('已加入下载队列');
        startDownloadQueue();
        return true;
    };

    // --- 批量操作 ---

    const handleBatchAddToQueue = (songs: Song[]) => {
        if (!addAllToQueue) {
            toast('播放器未就绪');
            return;
        }
        if (songs.length === 0) return;

        addAllToQueue(songs);
        toast(`已将 ${songs.length} 首歌曲加入队列`);
    };

    const handleBatchAddToFavorites = async (songs: Song[]) => {
        if (songs.length === 0) return;
        try {
            const playlists = await getUserPlaylists();
            let fav = playlists.find(p => p.title === FAVORITE_PLAYLIST_TITLE);
            if (!fav) fav = await createUserPlaylist(FAVORITE_PLAYLIST_TITLE);

            const allInFav = songs.every(s => fav?.songs?.some(item => item.id === s.id));

            if (allInFav) {
                let removed = 0;
                for (const song of songs) {
                    if (await removeSongFromFavorites(song.id)) removed++;
                }
                toast(`已移出 ${removed} 首歌曲`);
                return;
            }

            let count = 0;
            for (const song of songs) {
                if (await addSongToPlaylist(fav.id, song)) count++;
            }
            toast(`已将 ${count} 首新歌加入“${FAVORITE_PLAYLIST_TITLE}”`);
        } catch (e) {
            console.error(e);
            toast('批量收藏失败');
        }
    };

    const handleBatchAddToPlaylist = async (playlistId: string, songs: Song[]) => {
        if (songs.length === 0) return;
        try {
            let count = 0;
            for (const song of songs) {
                if (await addSongToPlaylist(playlistId, song)) count++;
            }
            toast(`成功添加 ${count} 首歌曲`);
        } catch (e) {
            console.error(e);
            toast('批量添加失败');
        }
    };

    const handleBatchDownload = async (songs: Song[], type: 'music' | 'video' = 'music') => {
        if (!songs.length) return;
        toast(type === 'video' ? '开始批量下载 MV...' : '开始批量下载歌曲...');
        let success = 0;
        for (const s of songs) {
            const ok = await handleDownload(s, type);
            if (!ok) break;
            success += 1;
        }
        if (success === 0) {
            toast('下载次数不足，请先前往福利中心获取下载次数');
        } else {
            const tail = success < songs.length ? '，其余因次数不足未添加' : '';
            toast(`已添加 ${success} 个下载任务${tail}`);
        }
    };

    return {
        showSheet,
        selectedSong,
        open,
        close,
        setShowSheet,
        setSelectedSong,

        handleAddToQueue,
        handleAddToNext,
        handleAddToFavorites,
        handleAddToPlaylist,
        handleCreatePlaylistAndAdd,
        handleDownload,

        handleBatchAddToQueue,
        handleBatchAddToFavorites,
        handleBatchAddToPlaylist,
        handleBatchDownload
    };
};
