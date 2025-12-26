import { Playlist, Song } from './types';
import { 
    saveBackupToFile, 
    getBackupList, 
    deleteFileSafely, 
    PATHS,
    safeToast 
} from './fileSystem';
import { writeOnlinePlaylistFavorites } from './onlinePlaylistFavorites';
import { REWARD_EVENTS, setDownloadChances, setPointsBalance } from './rewards';

const DB_NAME = 'LynxMusicDB';
const DB_VERSION = 3;

const STORE_PLAYLISTS = 'playlists';
const STORE_LOCAL_SONGS = 'local_songs';
const STORE_PLAY_HISTORY = 'play_history';
const TOTAL_LISTEN_SECONDS_KEY = 'hm_total_listen_seconds_v1';
const CLEAR_PLAY_HISTORY_TS_KEY = 'hm_play_history_clear_ts';
const PREVIEW_COVER_CACHE_KEY = 'hm_preview_covers_v1';

// 自动备份相关常量
const AUTO_BACKUP_PREFIX = 'auto_backup';
const HISTORY_ARCHIVE_PREFIX = 'history_archive';
const MAX_AUTO_BACKUPS = 10;

// Reward & task storage keys that need to be captured in backups
const REWARD_STORAGE_KEYS = {
    points: 'hm_points_balance_v2',
    downloadChances: 'hm_download_chances_v1',
    privilege: 'hm_download_privilege_v1',
};

const TASK_STORAGE_KEYS = {
    signIns: 'hm_sign_in_history_v2',
    taskProgress: 'hm_task_progress_v2',
    collectStat: 'hm_collect_stat_v1',
    discoverVisit: 'hm_discover_visit_v1',
    quarkTransfer: 'hm_quark_transfer_v1'
};

const ONLINE_FAV_STORAGE_KEY = 'hm_fav_playlists_v1';

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

const readTotalListenSeconds = () => {
    const raw = localStorage.getItem(TOTAL_LISTEN_SECONDS_KEY);
    const val = raw ? Number(raw) : 0;
    if (!Number.isFinite(val)) return 0;
    return Math.max(0, Math.floor(val));
};

const writeTotalListenSeconds = (val: number) => {
    localStorage.setItem(TOTAL_LISTEN_SECONDS_KEY, String(Math.max(0, Math.floor(val))));
};

const bumpTotalListenSeconds = (delta: number) => {
    if (!delta || delta <= 0) return;
    writeTotalListenSeconds(readTotalListenSeconds() + Math.max(0, Math.floor(delta)));
};

const ensureTotalListenSeconds = (minVal: number) => {
    const current = readTotalListenSeconds();
    if (minVal > current) {
        writeTotalListenSeconds(minVal);
        return minVal;
    }
    return current;
};

const readClearBeforeTs = () => {
    const raw = localStorage.getItem(CLEAR_PLAY_HISTORY_TS_KEY);
    const val = raw ? Number(raw) : 0;
    return Number.isFinite(val) ? val : 0;
};

const setClearBeforeTs = (ts: number) => {
    localStorage.setItem(CLEAR_PLAY_HISTORY_TS_KEY, String(ts));
};

const readJson = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

const writeJson = (key: string, value: any) => {
    try {
        if (value === undefined || value === null) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore persistence errors
    }
};

// --- Snapshot Helpers ---
const applyRewardSnapshot = (snapshot?: any) => {
    if (!snapshot) return;
    if (typeof snapshot.points === 'number') setPointsBalance(snapshot.points);
    if (typeof snapshot.downloadChances === 'number') setDownloadChances(snapshot.downloadChances);
    const privileged = snapshot.hasPrivilege === true;
    if (privileged) {
        localStorage.setItem(REWARD_STORAGE_KEYS.privilege, '1');
    } else {
        localStorage.removeItem(REWARD_STORAGE_KEYS.privilege);
    }
    try {
        window.dispatchEvent(new CustomEvent(REWARD_EVENTS.privilegeChanged, { detail: { privileged } }));
    } catch { }
};

const applyTaskSnapshot = (snapshot?: any) => {
    if (!snapshot) return;
    if (snapshot.signIns !== undefined) writeJson(TASK_STORAGE_KEYS.signIns, snapshot.signIns);
    if (snapshot.taskProgress !== undefined) writeJson(TASK_STORAGE_KEYS.taskProgress, snapshot.taskProgress);
    if (snapshot.collectStat !== undefined) writeJson(TASK_STORAGE_KEYS.collectStat, snapshot.collectStat);
    if (snapshot.discoverVisit !== undefined) writeJson(TASK_STORAGE_KEYS.discoverVisit, snapshot.discoverVisit);
    if (snapshot.quarkTransfer !== undefined) writeJson(TASK_STORAGE_KEYS.quarkTransfer, snapshot.quarkTransfer);
};

const applyFavoritesSnapshot = (snapshot?: any) => {
    if (!snapshot) return;
    if (snapshot.onlinePlaylists) {
        const set = new Set<string>(
            Array.isArray(snapshot.onlinePlaylists)
                ? snapshot.onlinePlaylists.map((id: any) => String(id))
                : []
        );
        writeOnlinePlaylistFavorites(set);
    }
    if (snapshot.previewCoverCache !== undefined) {
        writeJson(PREVIEW_COVER_CACHE_KEY, snapshot.previewCoverCache);
    }
};

const applySettingsSnapshot = (snapshot?: any) => {
    if (!snapshot) return;
    if (typeof snapshot.apiHost === 'string') localStorage.setItem('setting_api_host', snapshot.apiHost);
    if (typeof snapshot.apiKey === 'string') localStorage.setItem('setting_api_key', snapshot.apiKey);
};

// --- 数据库基础操作 ---
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
    let previousSeconds = 0;
    try {
        const existing = await getItem<PlayHistoryRecord>(STORE_PLAY_HISTORY, id);
        previousSeconds = Math.max(0, Math.floor(existing?.playedSeconds || 0));
    } catch { }

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
    const delta = Math.max(0, rec.playedSeconds - previousSeconds);
    bumpTotalListenSeconds(delta);
    emitListenHistoryUpdated();
};

export const dbGetAllPlayHistory = () => getAllItems<PlayHistoryRecord>(STORE_PLAY_HISTORY);

export const dbClearPlayHistory = async () => {
    await backupPlayHistoryToFile();
    setClearBeforeTs(Date.now());
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

// ---------------- 备份与恢复 ----------------

export const exportFullData = async (): Promise<string> => {
    try {
        const [playlists, localSongs, playHistory] = await Promise.all([
            dbGetPlaylists(),
            dbGetLocalSongs(),
            dbGetAllPlayHistory(),
        ]);

        const rewardsSnapshot = {
            points: Number(localStorage.getItem(REWARD_STORAGE_KEYS.points) || 0) || 0,
            downloadChances: Number(localStorage.getItem(REWARD_STORAGE_KEYS.downloadChances) || 0) || 0,
            hasPrivilege: localStorage.getItem(REWARD_STORAGE_KEYS.privilege) === '1'
        };

        const backupData = {
            meta: {
                version: '1.3',
                appName: 'LynxMusic',
                timestamp: Date.now(),
                device: navigator.userAgent
            },
            data: {
                playlists,
                localSongs,
                playHistory,
                stats: {
                    totalListenSeconds: readTotalListenSeconds(),
                    clearBeforeTs: readClearBeforeTs()
                },
                tasks: {
                    signIns: readJson(TASK_STORAGE_KEYS.signIns, []),
                    taskProgress: readJson(TASK_STORAGE_KEYS.taskProgress, {}),
                    collectStat: readJson(TASK_STORAGE_KEYS.collectStat, null),
                    discoverVisit: readJson(TASK_STORAGE_KEYS.discoverVisit, null),
                    quarkTransfer: readJson(TASK_STORAGE_KEYS.quarkTransfer, null)
                },
                favorites: {
                    onlinePlaylists: readJson<string[]>(ONLINE_FAV_STORAGE_KEY, []),
                    previewCoverCache: readJson(PREVIEW_COVER_CACHE_KEY, {})
                },
                rewardsSnapshot,
                settings: {
                    apiHost: localStorage.getItem('setting_api_host') || '',
                    apiKey: localStorage.getItem('setting_api_key') || ''
                }
            }
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
            return { success: false, msg: 'Invalid backup file' };
        }

        const db = await openDB();
        const tx = db.transaction([STORE_PLAYLISTS, STORE_LOCAL_SONGS, STORE_PLAY_HISTORY], 'readwrite');
        let importedPlaySeconds = 0;

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
            backup.data.playHistory.forEach((item: any) => {
                phStore.put(item);
                importedPlaySeconds += Math.max(0, Math.floor(Number(item?.playedSeconds) || 0));
            });
        }

        return new Promise((resolve) => {
            tx.oncomplete = () => {
                ensureTotalListenSeconds(importedPlaySeconds);
                try {
                    if (backup.data?.stats) {
                        const targetSeconds = Math.max(
                            importedPlaySeconds,
                            Number(backup.data.stats.totalListenSeconds) || 0
                        );
                        ensureTotalListenSeconds(targetSeconds);
                        if (backup.data.stats.clearBeforeTs !== undefined) {
                            setClearBeforeTs(Number(backup.data.stats.clearBeforeTs) || 0);
                        }
                    }
                    if (backup.data?.rewardsSnapshot) applyRewardSnapshot(backup.data.rewardsSnapshot);
                    if (backup.data?.tasks) applyTaskSnapshot(backup.data.tasks);
                    if (backup.data?.favorites) applyFavoritesSnapshot(backup.data.favorites);
                    if (backup.data?.settings) applySettingsSnapshot(backup.data.settings);
                } catch (err) {
                    console.warn('Apply backup extras failed', err);
                }
                resolve({
                    success: true,
                    msg: `Restore success (backup: ${new Date(backup.meta.timestamp).toLocaleString()})`
                });
            };
            tx.onerror = () => resolve({ success: false, msg: 'Database write failed' });
        });
    } catch (e) {
        console.error('Import failed', e);
        return { success: false, msg: 'Failed to parse backup file' };
    }
};

export const createFullBackup = async (options?: { fileName?: string; overwrite?: boolean; silent?: boolean }): Promise<boolean> => {
    const data = await exportFullData();
    const ok = saveBackupToFile(data, 'backup', {
        fileName: options?.fileName,
        overwrite: options?.overwrite ?? !!options?.fileName,
        silent: options?.silent
    });
    return !!ok;
};

export const backupPlayHistoryToFile = async () => {
    try {
        const history = await dbGetAllPlayHistory();
        if (!history.length) return false;
        const totalSeconds = history.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
        const payload = {
            meta: {
                version: '1.0',
                type: 'play_history',
                timestamp: Date.now(),
                count: history.length,
                totalSeconds
            },
            data: history
        };
        return saveBackupToFile(JSON.stringify(payload, null, 2), 'play_history', {
            fileName: 'play_history_latest.json',
            overwrite: true
        });
    } catch (e) {
        console.warn('Backup play history failed', e);
        return false;
    }
};

export const getTotalListenSeconds = () => ensureTotalListenSeconds(0);

export const clearDatabase = async () => {
    try {
        await createFullBackup({ fileName: 'backup_latest.json', overwrite: true, silent: true });
    } catch (e) {
        console.warn('Auto backup before clear failed', e);
    }
    const db = await openDB();
    const tx = db.transaction([STORE_PLAYLISTS, STORE_PLAY_HISTORY], 'readwrite');
    tx.objectStore(STORE_PLAYLISTS).clear();
    tx.objectStore(STORE_PLAY_HISTORY).clear();
    writeTotalListenSeconds(0);
};

export const addListenRecord = async (
    song: Song,
    playedSeconds: number,
    ts = Date.now(),
    recordId?: string
) => {
    await dbAppendPlayHistory(song, playedSeconds, ts, recordId);
};

export const getListenRecords = async (options?: { includeCleared?: boolean }): Promise<ListenRecord[]> => {
    const clearBefore = options?.includeCleared ? 0 : readClearBeforeTs();
    const list = await dbGetAllPlayHistory();
    const normalized = list
        .map((item) => ({
            ...item,
            playedSeconds: Math.max(0, Math.floor(Number(item.playedSeconds) || 0))
        }))
        .sort((a, b) => b.ts - a.ts);

    const sumSeconds = normalized.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
    ensureTotalListenSeconds(sumSeconds);

    if (!clearBefore) return normalized;
    return normalized.filter((item) => item.ts > clearBefore);
};

// ---------------- 自动备份与调度逻辑 ----------------

/**
 * 清理旧的自动备份，只保留最近的 N 个
 */
const rotateAutoBackups = () => {
    try {
        const allBackups = getBackupList(); // 默认按时间倒序排列
        const autoBackups = allBackups.filter(name => name.startsWith(AUTO_BACKUP_PREFIX));

        if (autoBackups.length > MAX_AUTO_BACKUPS) {
            const toDelete = autoBackups.slice(MAX_AUTO_BACKUPS);
            toDelete.forEach(filename => {
                const fullPath = `${PATHS.BACKUP}/${filename}`;
                deleteFileSafely(fullPath);
                console.log(`[AutoBackup] Rotated/Deleted old backup: ${filename}`);
            });
        }
    } catch (e) {
        console.warn('[AutoBackup] Rotation failed', e);
    }
};

/**
 * 执行一次自动全量备份
 */
export const performAutoBackup = async () => {
    try {
        console.log('[AutoBackup] Starting...');
        const data = await exportFullData();
        // saveBackupToFile 默认添加时间戳后缀，如 auto_backup_20251223_100000.json
        const success = saveBackupToFile(data, AUTO_BACKUP_PREFIX, { 
            silent: true 
        });

        if (success) {
            rotateAutoBackups();
        }
    } catch (e) {
        console.error('[AutoBackup] Failed', e);
    }
};

/**
 * 归档详细听歌记录 (用于年度报告)
 */
export const archivePlayHistory = async () => {
    try {
        const history = await dbGetAllPlayHistory();
        if (!history.length) return;

        const totalSeconds = history.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
        const songCount = new Set(history.map(h => h.songId)).size;

        const payload = {
            meta: {
                version: '2.0', // 标记为详细归档版本
                type: 'annual_report_source',
                timestamp: Date.now(),
                recordCount: history.length,
                totalPlaySeconds: totalSeconds,
                uniqueSongs: songCount,
                device: navigator.userAgent
            },
            data: history
        };

        // 保存为 history_archive_YYYYMMDD_HHMMSS.json
        saveBackupToFile(JSON.stringify(payload, null, 2), HISTORY_ARCHIVE_PREFIX, {
            silent: true
        });
        console.log('[HistoryArchive] Saved successfully');
    } catch (e) {
        console.error('[HistoryArchive] Failed', e);
    }
};

/**
 * 初始化备份调度器
 * 建议在 App.tsx 的 useEffect 中调用
 */
let backupIntervalId: any = null;

export const initBackupScheduler = () => {
    if (backupIntervalId) return;

    const ONE_HOUR_MS = 60 * 60 * 1000;
    
    console.log('[Scheduler] Backup service started');

    backupIntervalId = setInterval(async () => {
        // 执行自动全量备份 (含轮转)
        await performAutoBackup();
        
        // 同时执行听歌记录归档 (每小时一份，可用于生成高精度报告)
        await archivePlayHistory();
        
    }, ONE_HOUR_MS);
};