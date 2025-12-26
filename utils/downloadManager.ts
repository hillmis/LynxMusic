import { DownloadTask, DownloadType } from '../types';
import { blobToBase64, getNative, saveDownloadedMedia, safeToast } from './fileSystem';

const STORAGE_KEY = 'hm_download_tasks_v1';
const CONFIG_KEY = 'hm_download_config_v1';

const runningControllers = new Map<string, AbortController>();
const emitLocalRefresh = (path: string, type: DownloadType) => {
    try {
        window.dispatchEvent(new CustomEvent('hm-local-refresh', { detail: { path, type } }));
    } catch { }
};

const readTasks = (): DownloadTask[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw) as DownloadTask[];
        if (!Array.isArray(list)) return [];
        return list;
    } catch {
        return [];
    }
};

const writeTasks = (list: DownloadTask[], opts: { skipSchedule?: boolean } = {}) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    subscribers.forEach(cb => cb(list));
    if (!opts.skipSchedule) {
        scheduleDownloads();
    }
};

export const setDownloadTasks = (list: DownloadTask[]) => writeTasks(list);

const subscribers = new Set<(tasks: DownloadTask[]) => void>();

export const subscribeDownloadTasks = (cb: (tasks: DownloadTask[]) => void) => {
    subscribers.add(cb);
    cb(readTasks());
    return () => subscribers.delete(cb);
};

export const getDownloadTasks = () => readTasks();

export type DownloadConfig = {
    concurrency: number;
};

const defaultConfig: DownloadConfig = { concurrency: 2 };

const clampConcurrency = (val: number) => {
    if (!Number.isFinite(val)) return defaultConfig.concurrency;
    return Math.min(10, Math.max(1, Math.round(val)));
};

export const getDownloadConfig = (): DownloadConfig => {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return defaultConfig;
        const parsed = JSON.parse(raw);
        return {
            concurrency: clampConcurrency(Number(parsed?.concurrency))
        };
    } catch {
        return defaultConfig;
    }
};

export const saveDownloadConfig = (config: DownloadConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ concurrency: clampConcurrency(config.concurrency) }));
};

export const setDownloadConcurrency = (val: number) => {
    saveDownloadConfig({ concurrency: val });
    scheduleDownloads();
};

export const createDownloadTask = (
    payload: Partial<DownloadTask> & { type: DownloadType; title: string }
): DownloadTask => {
    const list = readTasks();
    const existingIds = new Set(list.map(t => t.id));
    const baseId = payload.id || `dl_${Date.now()}`;
    let id = baseId;
    let counter = 1;
    while (existingIds.has(id)) {
        id = `${baseId}_${counter++}`;
    }

    const task: DownloadTask = {
        id,
        songId: payload.songId,
        title: payload.title,
        artist: payload.artist,
        coverUrl: payload.coverUrl,
        type: payload.type,
        status: payload.status || 'pending',
        progress: payload.progress ?? 0,
        createdAt: payload.createdAt || Date.now(),
        path: payload.path,
        error: payload.error,
        fileSize: payload.fileSize,
        url: payload.url,
        ext: payload.ext,
        fileName: payload.fileName,
        mime: payload.mime,
        pathHint: payload.pathHint,
    };

    list.unshift(task);
    writeTasks(list);
    return task;
};

export const updateDownloadTask = (id: string, patch: Partial<DownloadTask>, opts: { skipSchedule?: boolean } = {}) => {
    const list = readTasks();
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch };
    writeTasks(list, opts);
};

export const removeDownloadTask = (id: string) => {
    const list = readTasks().filter(t => t.id !== id);
    const ctl = runningControllers.get(id);
    if (ctl) {
        ctl.abort();
        runningControllers.delete(id);
    }
    writeTasks(list);
};

export const clearFinishedTasks = () => {
    const list = readTasks().filter(t => t.status === 'downloading' || t.status === 'pending');
    writeTasks(list);
};

export const markTaskFailed = (id: string, error: string) => {
    updateDownloadTask(id, { status: 'failed', error, progress: 0 });
};

export const markTaskCompleted = (id: string, path: string) => {
    updateDownloadTask(id, { status: 'completed', path, progress: 100 });
};

const getExtensionFromPath = (value?: string | null): string | null => {
    if (!value) return null;
    const clean = value.split('?')[0].split('#')[0];
    const match = clean.match(/\.([a-z0-9]+)$/i);
    return match ? `.${match[1].toLowerCase()}` : null;
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
        'image/jpeg': '.jpg',
        'image/png': '.png'
    };
    return map[type] || null;
};

const getExtensionFromDisposition = (disposition: string | null): string | null => {
    if (!disposition) return null;
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^;"\n]+)/i);
    if (!match) return null;
    const name = decodeURIComponent(match[1].replace(/"/g, ''));
    return getExtensionFromPath(name);
};

const ensureExtension = (filename: string, ext: string | null, fallback: string) => {
    const safeExt = ext || fallback;
    if (!safeExt) return filename;
    return filename.toLowerCase().endsWith(safeExt) ? filename : `${filename}${safeExt}`;
};

const performRemoteDownload = async (
    task: DownloadTask,
    controller: AbortController,
    onProgress: (p: number) => void
): Promise<string> => {
    const url = task.url!;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length') || 0);
    const disposition = res.headers.get('content-disposition') || '';
    const contentType = res.headers.get('content-type') || '';

    if (!res.body) {
        const blob = await res.blob();
        onProgress(90);
        const base64 = await blobToBase64(blob);
        const filename = ensureExtension(
            task.fileName || task.title,
            getExtensionFromDisposition(disposition) || getExtensionFromPath(url) || getExtensionFromContentType(contentType),
            task.ext || (task.type === 'mv' ? '.mp4' : task.type === 'picture' ? '.jpg' : '.mp3')
        );
        const saved = saveDownloadedMedia(filename, base64, task.type, contentType || blob.type || undefined);
        if (!saved) throw new Error('保存失败');
        return saved;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            received += value.length;
            if (total) onProgress(Math.min(95, Math.round((received / total) * 90)));
        }
    }

    const blob = new Blob(chunks, { type: contentType || 'application/octet-stream' });
    if (!total && received) onProgress(90);

    const base64 = await blobToBase64(blob);
    const filename = ensureExtension(
        task.fileName || task.title,
        getExtensionFromDisposition(disposition) ||
        getExtensionFromPath(url) ||
        getExtensionFromContentType(contentType || blob.type || null) ||
        task.ext,
        task.ext || (task.type === 'mv' ? '.mp4' : task.type === 'picture' ? '.jpg' : '.mp3')
    );

    const savedPath = saveDownloadedMedia(filename, base64, task.type, contentType || blob.type || undefined);
    if (!savedPath) throw new Error('保存失败');
    return savedPath;
};

const performLocalCopy = (task: DownloadTask): string => {
    const native = getNative();
    const localPath = decodeURI(task.url!.replace('file://', ''));
    const ext = getExtensionFromPath(localPath) || getExtensionFromPath(task.pathHint) || task.ext || (task.type === 'mv' ? '.mp4' : '.mp3');
    const filename = ensureExtension(task.fileName || task.title, ext, ext || (task.type === 'mv' ? '.mp4' : '.mp3'));
    const fileData = native?.file?.read?.(localPath) ?? native?.gainfile?.(localPath);
    if (!fileData) throw new Error('无法读取本地文件');
    const savedPath = saveDownloadedMedia(filename, fileData, task.type);
    if (!savedPath) throw new Error('保存失败');
    return savedPath;
};

const runSingleDownload = async (task: DownloadTask) => {
    if (!task.url) {
        markTaskFailed(task.id, '缺少下载链接');
        return;
    }
    const controller = new AbortController();
    runningControllers.set(task.id, controller);
    try {
        updateDownloadTask(task.id, { status: 'downloading', error: undefined, progress: Math.max(1, task.progress || 0) }, { skipSchedule: true });
        const saver = task.url.startsWith('file://')
            ? performLocalCopy(task)
            : await performRemoteDownload(task, controller, (p) => updateDownloadTask(task.id, { progress: p, status: 'downloading' }, { skipSchedule: true }));
        markTaskCompleted(task.id, saver);
        emitLocalRefresh(saver, task.type);
    } catch (e: any) {
        if (controller.signal.aborted) {
            updateDownloadTask(task.id, { status: 'pending', error: '已暂停' }, { skipSchedule: true });
        } else {
            console.error('download failed', e);
            markTaskFailed(task.id, e?.message || '下载失败');
            safeToast('下载失败，请重试');
        }
    } finally {
        runningControllers.delete(task.id);
        scheduleDownloads();
    }
};

export const pauseDownloadTask = (id: string) => {
    const ctl = runningControllers.get(id);
    if (ctl) {
        ctl.abort();
        runningControllers.delete(id);
    }
    const list = readTasks().map(t => t.id === id && t.status === 'downloading' ? { ...t, status: 'pending' as const } : t);
    writeTasks(list, { skipSchedule: true });
};

export const resumeDownloadTask = (id: string) => {
    const list = readTasks().map(t => {
        if (t.id !== id) return t;
        if (t.status === 'completed') return t;
        return { ...t, status: 'pending' as const, error: undefined };
    });
    writeTasks(list);
};

export const pauseAllDownloads = () => {
    runningControllers.forEach(c => c.abort());
    runningControllers.clear();
    const list = readTasks().map(t => t.status === 'downloading' ? { ...t, status: 'pending' as const } : t);
    writeTasks(list, { skipSchedule: true });
};

export const startAllDownloads = (includeFailed = true) => {
    const list = readTasks().map(t => {
        if (t.status === 'completed') return t;
        if (!includeFailed && t.status === 'failed') return t;
        return { ...t, status: 'pending' as const, error: undefined };
    });
    writeTasks(list);
};

export const toggleDownloadTask = (id: string) => {
    const task = readTasks().find(t => t.id === id);
    if (!task) return;
    if (task.status === 'downloading') return pauseDownloadTask(id);
    resumeDownloadTask(id);
};

const scheduleDownloads = () => {
    const { concurrency } = getDownloadConfig();
    const tasks = readTasks().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Clean up controllers for tasks no longer downloading
    runningControllers.forEach((ctl, id) => {
        const stillRunning = tasks.find(t => t.id === id && t.status === 'downloading');
        if (!stillRunning) {
            ctl.abort();
            runningControllers.delete(id);
        }
    });

    let running = runningControllers.size;
    for (const task of tasks) {
        if (running >= concurrency) break;
        if (task.status === 'downloading') {
            if (!runningControllers.has(task.id)) {
                runSingleDownload(task);
            }
            running += 1;
            continue;
        }
        if (task.status === 'completed') continue;
        // skip tasks without url
        if (!task.url) continue;
        running += 1;
        runSingleDownload(task);
    }
};

export const requeueFailedTasks = () => {
    const list = readTasks().map(t => t.status === 'failed' ? { ...t, status: 'pending' as const, error: undefined } : t);
    writeTasks(list);
};

export const startDownloadQueue = () => {
    scheduleDownloads();
};
