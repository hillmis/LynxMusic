import { useState } from 'react';
import { Song } from '../types';
import { getUserPlaylists, addSongToPlaylist, createUserPlaylist, FAVORITE_PLAYLIST_TITLE, isSongInFavorites, removeSongFromFavorites } from '../utils/playlistStore';
import { saveDownloadedSong, blobToBase64 } from '../utils/fileSystem';
import { dbSaveLocalSong } from '../utils/db';

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
    const toast = (msg: string) => {
        if (window.webapp?.toast) {
            window.webapp.toast(msg);
        } else {
            console.log('[Toast]:', msg);
        }
    };

    const getExtensionFromPath = (value?: string | null): string | null => {
        if (!value) return null;
        const clean = value.split('?')[0].split('#')[0];
        const match = clean.match(/\.([a-z0-9]+)$/i);
        return match ? `.${match[1].toLowerCase()}` : null;
    };

    const getExtensionFromDisposition = (disposition: string | null): string | null => {
        if (!disposition) return null;
        const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^;"\n]+)/i);
        if (!match) return null;
        const name = decodeURIComponent(match[1].replace(/"/g, ''));
        return getExtensionFromPath(name);
    };

    const getExtensionFromContentType = (contentType: string | null): string | null => {
        if (!contentType) return null;
        const type = contentType.split(';')[0].trim().toLowerCase();
        const map: Record<string, string> = {
            'audio/flac': '.flac',
            'audio/x-flac': '.flac',
            'audio/mpeg': '.mp3',
            'audio/mp3': '.mp3',
            'audio/mp4': '.m4a',
            'audio/aac': '.aac',
            'audio/ogg': '.ogg',
            'audio/wav': '.wav',
            'audio/x-wav': '.wav',
            'audio/webm': '.webm',
            'audio/x-ms-wma': '.wma',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/x-matroska': '.mkv',
        };
        return map[type] || null;
    };

    const ensureExtension = (filename: string, ext: string | null, fallback: string) => {
        const safeExt = ext || fallback;
        if (!safeExt) return filename;
        return filename.toLowerCase().endsWith(safeExt) ? filename : `${filename}${safeExt}`;
    };

    const toFileUrl = (path: string) => {
        if (path.startsWith('file://')) return path;
        return `file://${encodeURI(path)}`;
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
        const fallbackExt = type === 'music' ? '.mp3' : '.mp4';

        if (!targetUrl) {
            toast('暂无下载链接');
            return;
        }

        toast('开始下载，请稍候...');

        try {
            const baseName = `${song.artist || '未知歌手'} - ${song.title || '未知歌曲'}`.trim();

            if (targetUrl.startsWith('file://')) {
                const localPath = decodeURI(targetUrl.replace('file://', ''));
                const ext = getExtensionFromPath(localPath) || getExtensionFromPath(song.path) || fallbackExt;
                const filename = ensureExtension(baseName, ext, fallbackExt);
                const fileData = window.webapp?.gainfile?.(localPath);
                if (!fileData) {
                    toast('读取本地文件失败');
                    return;
                }
                saveDownloadedSong(filename, fileData);
                return;
            }

            // 2. Fetch 数据
            const res = await fetch(targetUrl);
            if (!res.ok) {
                toast(`下载失败 (${res.status})`);
                return;
            }
            const blob = await res.blob();

            // 3. 转纯 Base64
            const base64 = await blobToBase64(blob);

            // 4. 调用 webapp 接口保存
            const extFromHeader = getExtensionFromDisposition(res.headers.get('content-disposition'));
            const extFromUrl = getExtensionFromPath(targetUrl);
            const extFromType = getExtensionFromContentType(res.headers.get('content-type') || blob.type || null);
            const filename = ensureExtension(baseName, extFromHeader || extFromUrl || extFromType, fallbackExt);
            const savedPath = saveDownloadedSong(filename, base64);

            if (!savedPath) {
                // saveDownloadedSong 内部会 toast 失败原因
                return;
            }

            // 5. 保存到本地数据库 (Local Songs DB)
            const localSong: Song = {
                ...song,
                id: `loc_${savedPath}`,
                url: toFileUrl(savedPath),
                path: savedPath,
                source: 'download',
                isDetailsLoaded: true,
                quality: 'Local',
                mvUrl: type === 'video' ? toFileUrl(savedPath) : song.mvUrl
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
        handleAddToNext,
        handleAddToFavorites,
        handleAddToPlaylist,
        handleCreatePlaylistAndAdd,
        handleDownload,

        handleBatchAddToQueue,
        handleBatchAddToFavorites,
        handleBatchAddToPlaylist
    };
};
