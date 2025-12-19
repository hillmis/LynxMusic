import { Playlist, Song } from './types';
import { saveBackupToFile } from './fileSystem';

const DB_NAME = 'HillMusicDB';
const DB_VERSION = 3;

const STORE_PLAYLISTS = 'playlists';
const STORE_LOCAL_SONGS = 'local_songs';
const STORE_PLAY_HISTORY = 'play_history';

export interface PlayHistoryRecord {
    id: string;              // `${ts}_${songId}`
    ts: number;              // 播放发生时间（ms）
    dayKey: string;          // YYYY-MM-DD
    weekKey: string;         // YYYY-W##
    monthKey: string;        // YYYY-MM
    yearKey: string;         // YYYY
    songId: string;
    title: string;
    artist: string;
    coverUrl?: string;
    duration?: number;       // 秒（歌曲时长）
    playedSeconds: number;   // 本次累计播放时长（秒）
    source?: string;
}

export type ListenRecord = PlayHistoryRecord;

// ---- 时间工具 ----
const pad2 = (n: number) => String(n).padStart(2, '0');

const toDayKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const toMonthKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const toYearKey = (ts: number) => String(new Date(ts).getFullYear());

const toIsoWeekKey = (ts: number) => {
    const d = new Date(ts);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${pad2(weekNo)}`;
};

// 初始化数据库
export const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) =>
            reject('Database error: ' + (event.target as any).error);

        request.onsuccess = (event) =>
            resolve((event.target as IDBOpenDBRequest).result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
                db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_LOCAL_SONGS)) {
                db.createObjectStore(STORE_LOCAL_SONGS, { keyPath: 'path' });
            }
            if (!db.objectStoreNames.contains(STORE_PLAY_HISTORY)) {
                const s = db.createObjectStore(STORE_PLAY_HISTORY, { keyPath: 'id' });
                s.createIndex('by_ts', 'ts', { unique: false });
                s.createIndex('by_day', 'dayKey', { unique: false });
            }
        };
    });
};

// 通用 CRUD
export const putItem = async <T>(storeName: string, item: T): Promise<T> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve(item);
        request.onerror = () => reject(request.error);
    });
};

export const getAllItems = async <T>(storeName: string): Promise<T[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
    });
};

export const getItem = async <T>(
    storeName: string,
    id: string
): Promise<T | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
    });
};

export const deleteItem = async (storeName: string, id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// ---------------- 业务封装 ----------------
export const dbGetPlaylists = () => getAllItems<Playlist>(STORE_PLAYLISTS);
export const dbSavePlaylist = (playlist: Playlist) => putItem(STORE_PLAYLISTS, playlist);
export const dbDeletePlaylist = (id: string) => deleteItem(STORE_PLAYLISTS, id);

export const dbGetLocalSongs = () => getAllItems<Song>(STORE_LOCAL_SONGS);
export const dbSaveLocalSong = (song: Song) => putItem(STORE_LOCAL_SONGS, song);
export const dbDeleteLocalSong = (path: string) => deleteItem(STORE_LOCAL_SONGS, path);
export const dbClearLocalSongs = async () => {
    const db = await openDB();
    const transaction = db.transaction(STORE_LOCAL_SONGS, 'readwrite');
    transaction.objectStore(STORE_LOCAL_SONGS).clear();
};

// ---------------- 播放历史 ----------------
const emitListenHistoryUpdated = () => {
    try {
        window.dispatchEvent(new Event('listen-history-updated'));
    } catch { }
};

export const dbAppendPlayHistory = async (
    song: Song,
    playedSeconds: number,
    ts = Date.now(),
    recordId?: string
) => {
    const id = recordId || `${ts}_${song.id}`;
    const rec: PlayHistoryRecord = {
        id,
        ts,
        dayKey: toDayKey(ts),
        weekKey: toIsoWeekKey(ts),
        monthKey: toMonthKey(ts),
        yearKey: toYearKey(ts),
        songId: song.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl,
        duration: Number((song as any).durationSec || (song as any).duration || 0) || undefined,
        playedSeconds: Math.max(0, Math.floor(playedSeconds || 0)),
        source: (song as any).source
    };
    await putItem(STORE_PLAY_HISTORY, rec);
    maybeAutoBackup();
    emitListenHistoryUpdated();
};

export const dbGetAllPlayHistory = () => getAllItems<PlayHistoryRecord>(STORE_PLAY_HISTORY);

// ✅ 新增：清空播放历史
export const dbClearPlayHistory = async () => {
    const db = await openDB();
    const transaction = db.transaction(STORE_PLAY_HISTORY, 'readwrite');
    transaction.objectStore(STORE_PLAY_HISTORY).clear();
    emitListenHistoryUpdated();
};

export const dbGetPlayHistoryByDay = async (dayKey: string) => {
    const db = await openDB();
    return new Promise<PlayHistoryRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PLAY_HISTORY, 'readonly');
        const idx = tx.objectStore(STORE_PLAY_HISTORY).index('by_day');
        const req = idx.getAll(dayKey);
        req.onsuccess = () => resolve(req.result as PlayHistoryRecord[]);
        req.onerror = () => reject(req.error);
    });
};

// --- 备份与恢复 ---
export const exportFullData = async (): Promise<string> => {
    try {
        const [playlists, localSongs, playHistory] = await Promise.all([
            dbGetPlaylists(),
            dbGetLocalSongs(),
            dbGetAllPlayHistory(),
        ]);

        const backupData = {
            meta: {
                version: '1.2',
                appName: 'HillMusic',
                timestamp: Date.now(),
                device: navigator.userAgent
            },
            data: { playlists, localSongs, playHistory }
        };
        return JSON.stringify(backupData, null, 2);
    } catch (e) {
        console.error('Export DB failed', e);
        throw new Error('导出数据失败');
    }
};

export const importFullData = async (
    jsonString: string
): Promise<{ success: boolean; msg: string }> => {
    try {
        const backup = JSON.parse(jsonString);
        if (!backup.meta || !backup.data) {
            return { success: false, msg: '无效的备份文件格式' };
        }

        const db = await openDB();
        const tx = db.transaction([STORE_PLAYLISTS, STORE_LOCAL_SONGS, STORE_PLAY_HISTORY], 'readwrite');

        if (backup.data.playlists && Array.isArray(backup.data.playlists)) {
            const plStore = tx.objectStore(STORE_PLAYLISTS);
            backup.data.playlists.forEach((item: any) => plStore.put(item));
        }

        if (backup.data.localSongs && Array.isArray(backup.data.localSongs)) {
            const lsStore = tx.objectStore(STORE_LOCAL_SONGS);
            backup.data.localSongs.forEach((item: any) => lsStore.put(item));
        }

        if (backup.data.playHistory && Array.isArray(backup.data.playHistory)) {
            const phStore = tx.objectStore(STORE_PLAY_HISTORY);
            backup.data.playHistory.forEach((item: any) => phStore.put(item));
        }

        return new Promise((resolve) => {
            tx.oncomplete = () =>
                resolve({
                    success: true,
                    msg: `数据恢复成功 (备份时间: ${new Date(backup.meta.timestamp).toLocaleString()})`
                });
            tx.onerror = () => resolve({ success: false, msg: '数据库写入失败' });
        });
    } catch (e) {
        console.error('Import failed', e);
        return { success: false, msg: '解析备份文件失败' };
    }
};

const AUTO_BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时
const AUTO_BACKUP_KEY = 'hm_auto_backup_ts';

async function maybeAutoBackup() {
    try {
        const last = Number(localStorage.getItem(AUTO_BACKUP_KEY) || 0);
        if (Date.now() - last < AUTO_BACKUP_INTERVAL) return;

        const data = await exportFullData();
        const ok = saveBackupToFile(data);
        if (ok) {
            localStorage.setItem(AUTO_BACKUP_KEY, String(Date.now()));
        }
    } catch (e) {
        console.warn('Auto backup failed', e);
    }
}

export const clearDatabase = async () => {
    const db = await openDB();
    const tx = db.transaction([STORE_PLAYLISTS, STORE_PLAY_HISTORY], 'readwrite');
    tx.objectStore(STORE_PLAYLISTS).clear();
    tx.objectStore(STORE_PLAY_HISTORY).clear();
};

export const addListenRecord = async (
    song: Song,
    playedSeconds: number,
    ts = Date.now(),
    recordId?: string
) => {
    await dbAppendPlayHistory(song, playedSeconds, ts, recordId);
};

export const getListenRecords = async (): Promise<ListenRecord[]> => {
    const list = await dbGetAllPlayHistory();
    return list
        .map((item) => ({
            ...item,
            playedSeconds: Math.max(0, Math.floor(Number(item.playedSeconds) || 0))
        }))
        .sort((a, b) => b.ts - a.ts);
};
