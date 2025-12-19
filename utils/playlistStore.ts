//--- START OF FILE playlistStore.ts ---

import { Playlist, Song } from '../types';
import { dbSavePlaylist, dbDeletePlaylist, getItem } from './db';

export const FAVORITE_PLAYLIST_TITLE = '我喜欢';

const STORE_PLAYLISTS = 'playlists';
const STORAGE_KEY = 'hm_playlists_v1'; // LocalStorage fallback key

// 触发更新事件
const notifyUpdate = () => {
    window.dispatchEvent(new Event('playlist-updated'));
};

// 获取所有歌单 (混合 DB 和 LocalStorage 逻辑，根据你原有实现调整)
// 这里为了保持一致性，主要沿用 LocalStorage 逻辑，因为 dbSavePlaylist 似乎是 LocalStorage 封装
export const getUserPlaylists = async (): Promise<Playlist[]> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            // 默认创建一个“我喜欢”
            const defaultFav: Playlist = {
                id: 'fav_001',
                title: '我喜欢',
                creator: '我',
                coverUrl: '', // 将在 UI 中动态计算
                songCount: 0,
                description: '我的红心歌曲',
                songs: [],
                isLocal: true,
                source: 'local',
                createdAt: Date.now()
            };
            await savePlaylists([defaultFav]);
            return [defaultFav];
        }
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
};

const savePlaylists = async (list: Playlist[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    // 触发更新事件，通知 UI 刷新
    window.dispatchEvent(new Event('playlist-updated'));
};

// 创建新歌单
export const createUserPlaylist = async (title: string): Promise<Playlist> => {
    const list = await getUserPlaylists();
    const now = Date.now();
    const newPlaylist: Playlist = {
        id: `u_${now}`,
        title: title.trim() || '新建歌单',
        creator: '我',
        coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80',
        songCount: 0,
        description: '我的自建歌单',
        songs: [],
        isLocal: true,
        source: 'local',
        createdAt: now,
        updatedAt: now
    };

    list.push(newPlaylist);
    await savePlaylists(list);
    return newPlaylist;
};

// 获取单个歌单（最新）
export const getPlaylistById = async (playlistId: string): Promise<Playlist | undefined> => {
    const list = await getUserPlaylists();
    return list.find(p => p.id === playlistId);
};

// ✅ 编辑歌单信息（写入 DB）
export const updatePlaylistInfo = async (
    playlistId: string,
    patch: Partial<Pick<Playlist, 'title' | 'description' | 'coverUrl'>>
) => {
    const list = await getUserPlaylists();
    const idx = list.findIndex(p => p.id === playlistId);
    if (idx > -1) {
        list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
        await savePlaylists(list);
        return true;
    }
    return false;
};

// 添加歌曲到歌单
export const addSongToPlaylist = async (playlistId: string, song: Song): Promise<boolean> => {
    const list = await getUserPlaylists();
    const pl = list.find(p => p.id === playlistId);
    if (!pl) return false;

    if (!pl.songs) pl.songs = [];
    if (pl.songs.some((s) => s.id === song.id)) return false;

    pl.songs.unshift({ ...song, addedAt: Date.now() });
    pl.songCount = pl.songs.length;

    if (pl.songs.length === 1) {
        pl.coverUrl = song.coverUrl || pl.coverUrl;
        pl.coverImgStack = song.coverUrl ? [song.coverUrl, song.coverUrl, song.coverUrl] : pl.coverImgStack;
    }

    pl.updatedAt = Date.now();
    await savePlaylists(list);
    return true;
};

// ✅ 删除歌单内单曲
export const removeSongFromPlaylist = async (playlistId: string, songId: string) => {
    const list = await getUserPlaylists();
    const pl = list.find(p => p.id === playlistId);
    if (!pl || !pl.songs) return false;

    const prevLen = pl.songs.length;
    pl.songs = pl.songs.filter((s) => s.id !== songId);

    if (pl.songs.length === prevLen) return false;

    pl.songCount = pl.songs.length;
    pl.updatedAt = Date.now();

    // 如果删到空或删掉封面来源，可按需更新封面
    if (pl.songs.length > 0 && (!pl.coverUrl || pl.coverUrl.includes('unsplash'))) {
        pl.coverUrl = pl.songs[0].coverUrl || pl.coverUrl;
    }

    await savePlaylists(list);
    return true;
};

// ✅ 批量删除
export const batchRemoveSongsFromPlaylist = async (playlistId: string, songIds: string[]) => {
    const list = await getUserPlaylists();
    const pl = list.find(p => p.id === playlistId);
    if (!pl || !pl.songs) return false;

    pl.songs = pl.songs.filter((s) => !songIds.includes(s.id));
    pl.songCount = pl.songs.length;
    pl.updatedAt = Date.now();

    await savePlaylists(list);
    return true;
};

// ✅ 排序：传入新的 songs 顺序
export const reorderPlaylistSongs = async (playlistId: string, nextSongs: Song[]) => {
    const list = await getUserPlaylists();
    const pl = list.find(p => p.id === playlistId);
    if (!pl) return false;

    pl.songs = nextSongs;
    pl.updatedAt = Date.now();

    await savePlaylists(list);
    return true;
};

// 删除歌单
export const removePlaylist = async (playlistId: string) => {
    let list = await getUserPlaylists();
    list = list.filter(p => p.id !== playlistId);
    await savePlaylists(list);
};

// ✅ 新增：保存导入的外部歌单
export const saveImportedPlaylist = async (playlist: Playlist): Promise<boolean> => {
    const list = await getUserPlaylists();
    // 查重
    const index = list.findIndex(p => p.id === playlist.id);

    if (index >= 0) {
        // 如果已存在，更新信息
        list[index] = { ...list[index], ...playlist, updatedAt: Date.now() };
    } else {
        // 新增
        playlist.source = playlist.source || 'qq';
        playlist.isLocal = false; // 标记为非本地自建
        playlist.createdAt = Date.now();
        list.unshift(playlist); // 插入到前面 (仅次于置顶项)
    }

    await savePlaylists(list);
    return true;
};

// 判断歌曲是否已在“我喜欢”
export const isSongInFavorites = async (songId: string): Promise<boolean> => {
    if (!songId) return false;
    const list = await getUserPlaylists();
    const fav = list.find(p => p.title === FAVORITE_PLAYLIST_TITLE);
    return !!fav?.songs?.some((s) => s.id === songId);
};

// 从“我喜欢”移除
export const removeSongFromFavorites = async (songId: string): Promise<boolean> => {
    if (!songId) return false;
    const list = await getUserPlaylists();
    const fav = list.find(p => p.title === FAVORITE_PLAYLIST_TITLE);
    if (!fav || !fav.songs) return false;
    const before = fav.songs.length;
    fav.songs = fav.songs.filter(s => s.id !== songId);
    fav.songCount = fav.songs.length;
    fav.updatedAt = Date.now();
    if (fav.songs.length === 0) fav.coverUrl = '';
    await savePlaylists(list);
    return fav.songs.length !== before;
};
