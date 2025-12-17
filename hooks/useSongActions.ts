import { useState } from 'react';
import { Song } from '../types';
import { getUserPlaylists, addSongToPlaylist, createUserPlaylist, FAVORITE_PLAYLIST_TITLE, isSongInFavorites, removeSongFromFavorites } from '../utils/playlistStore';
import { saveDownloadedSong, blobToBase64 } from '../utils/fileSystem';
import { dbSaveLocalSong } from '../utils/db';

type Deps = {
    addToQueue?: (song: Song) => void;
    addAllToQueue?: (songs: Song[]) => void;
};

export const useSongActions = (deps: Deps = {}) => {
    const { addToQueue, addAllToQueue } = deps;

    const [showSheet, setShowSheet] = useState(false);
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);

    const open = (song: Song) => {
        setSelectedSong(song);
        setShowSheet(true);
    };

    const close = () => setShowSheet(false);

    // --- 辅助：安全的 Toast ---
    const toast = (msg: string) => {
        if (window.webapp?.toast) {
            window.webapp.toast(msg);
        } else {
            console.log('[Toast]:', msg);
        }
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
            const ok = await addSongToPlaylist(playlistId, song);
            toast(ok ? '已添加到歌单' : '歌曲已在歌单中');
        } catch (e) {
            console.error(e);
            toast('添加失败');
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
        // 1. 获取 URL
        const targetUrl = type === 'music' ? song.url : song.mvUrl;
        const suffix = type === 'music' ? '.mp3' : '.mp4';

        if (!targetUrl) {
            toast('暂无下载链接');
            return;
        }
        if (targetUrl.startsWith('file://')) {
            toast('本地歌曲无需下载');
            return;
        }

        toast('开始下载，请稍候...');

        try {
            // 2. Fetch 数据
            const res = await fetch(targetUrl);
            const blob = await res.blob();

            // 3. 转纯 Base64
            const base64 = await blobToBase64(blob);

            // 4. 调用 webapp 接口保存
            const filename = `${song.artist} - ${song.title}${suffix}`;
            const savedPath = saveDownloadedSong(filename, base64);

            if (!savedPath) {
                // saveDownloadedSong 内部会 toast 失败原因
                return;
            }

            // 5. 保存到本地数据库 (Local Songs DB)
            const localSong: Song = {
                ...song,
                id: `loc_${savedPath}`,
                url: `file://${savedPath}`,
                path: savedPath,
                source: 'download',
                isDetailsLoaded: true,
                quality: 'Local',
                mvUrl: type === 'video' ? `file://${savedPath}` : song.mvUrl
            };

            await dbSaveLocalSong(localSong);
            // toast('下载完成'); // saveDownloadedSong 已经提示过了
        } catch (e) {
            console.error('Download failed', e);
            toast('下载出错 (网络或跨域问题)');
        }
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

    return {
        showSheet,
        selectedSong,
        open,
        close,
        setShowSheet,
        setSelectedSong,

        handleAddToQueue,
        handleAddToFavorites,
        handleAddToPlaylist,
        handleCreatePlaylistAndAdd,
        handleDownload,

        handleBatchAddToQueue,
        handleBatchAddToFavorites,
        handleBatchAddToPlaylist
    };
};
