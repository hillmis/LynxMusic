//--- START OF FILE playlistStore.ts ---

import { Playlist, Song } from '../types';
import { dbSavePlaylist, dbDeletePlaylist, getItem, dbGetPlaylists, openDB } from './db';

export const FAVORITE_PLAYLIST_TITLE = '我喜欢';
// 与“我的”页面一致的红心封面（圆形底+红心）
export const FAVORITE_COVER_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
     <rect x="0" y="0" width="120" height="120" fill="#dcababff"/>
      <path d="M60 96 26 62c-9-9-9-25 2-34 8-7 21-6 30 3 9-9 22-10 30-3 11 9 11 25 2 34Z" fill="#ef4444"/>
    </svg>`
  );

const STORE_PLAYLISTS = 'playlists';
const STORAGE_KEY = 'hm_playlists_v1'; // LocalStorage fallback key
const COLLECT_STAT_KEY = 'hm_collect_stat_v1';

const todayKey = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const bumpCollectCounter = (delta = 1) => {
    try {
        const raw = localStorage.getItem(COLLECT_STAT_KEY);
        const parsed = raw ? JSON.parse(raw) as { date: string; count: number } : null;
        if (parsed && parsed.date === todayKey()) {
            const next = { date: parsed.date, count: Math.max(0, (parsed.count || 0) + delta) };
            localStorage.setItem(COLLECT_STAT_KEY, JSON.stringify(next));
        } else {
            localStorage.setItem(COLLECT_STAT_KEY, JSON.stringify({ date: todayKey(), count: Math.max(1, delta) }));
        }
    } catch {
        // ignore counter failures
    }
};

// 触发更新事件
const notifyUpdate = () => {
    window.dispatchEvent(new Event('playlist-updated'));
};

// 获取所有歌单 (混合 DB 和 LocalStorage 逻辑，根据你原有实现调整)
// 这里为了保持一致性，主要沿用 LocalStorage 逻辑，因为 dbSavePlaylist 似乎是 LocalStorage 封装
const persistPlaylistsToDb = async (list: Playlist[]) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_PLAYLISTS, 'readwrite');
        tx.objectStore(STORE_PLAYLISTS).clear();
        list.forEach(item => tx.objectStore(STORE_PLAYLISTS).put(item));
    } catch {
        // ignore cache errors
    }
};

export const getUserPlaylists = async (): Promise<Playlist[]> => {
    // 1) 尝试从 IndexedDB（缓存层）读取
    try {
        const dbList = await dbGetPlaylists();
        if (dbList && dbList.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dbList));
            return dbList;
        }
    } catch {
        // ignore
    }

    // 2) 回退 LocalStorage（重要数据本地持久）
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
    await persistPlaylistsToDb(list);
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
    bumpCollectCounter(1);
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

// 将外部导入的“我喜欢”同步到系统“我喜欢”
export const upsertFavoriteFromImport = async (playlist: Playlist, mode: 'merge' | 'override'): Promise<Playlist> => {
    const list = await getUserPlaylists();
    let fav = list.find(p => p.title === FAVORITE_PLAYLIST_TITLE);

    if (!fav) {
        fav = {
            id: 'fav_001',
            title: FAVORITE_PLAYLIST_TITLE,
            creator: 'me',
            coverUrl: '',
            songCount: 0,
            description: '我的红心歌曲',
            songs: [],
            isLocal: true,
            source: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        list.unshift(fav);
    }

    const importedSongs = (playlist.songs || []).map(s => ({ ...s, addedAt: Date.now() }));

    if (mode === 'override') {
        fav.songs = importedSongs;
    } else {
        const existMap = new Map((fav.songs || []).map(s => [s.id, s]));
        importedSongs.forEach(s => existMap.set(s.id, s));
        fav.songs = Array.from(existMap.values());
    }

    fav.songCount = fav.songs?.length || 0;
    const firstCover = fav.songs?.find(s => s.coverUrl)?.coverUrl;
    if (firstCover) {
        fav.coverUrl = firstCover;
        fav.coverImgStack = [firstCover, firstCover, firstCover];
    }
    fav.updatedAt = Date.now();

    await savePlaylists(list);
    return fav;
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
