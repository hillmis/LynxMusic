import { getNative, initNativeBridge } from './nativeBridge';
export { getNative, initNativeBridge } from './nativeBridge';

// Initialize the native bridge once this module loads so window.APP is available.
initNativeBridge();

export const safeToast = (msg: string) => {
  try {
    getNative()?.system?.toast?.(msg);
  } catch {
    // ignore native toast failures
  }
  // Browser fallback: lightweight bottom-center toast
  if (!getNative()) {
    const id = 'hm-web-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.bottom = '60px';
      el.style.transform = 'translateX(-50%)';
      el.style.background = 'rgba(255,255,255,0.95)';
      el.style.color = '#121212';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
      el.style.fontSize = '13px';
      el.style.zIndex = '9999';
      el.style.maxWidth = '80%';
      el.style.textAlign = 'center';
      el.style.wordBreak = 'break-word';
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transition = 'opacity 0.3s ease';
    setTimeout(() => { if (el) el.style.opacity = '0'; }, 2000);
  }
};

// Internal alias for legacy usage in this module
const toast = safeToast;

const getRootPath = () => {
  const native = getNative();
  const base =
    native?.file?.getRootDir?.() ||
    native?.file?.getExternalFilesDir?.() ||
    native?.file?.getExternalDir?.() ||
    '/storage/emulated/0';
  return `${String(base).replace(/\/$/, '')}/LynxMusic`;
};

export const PATHS = {
  ROOT: getRootPath(),
  BACKUP: `${getRootPath()}/backup`,
  DOWNLOAD_ROOT: `${getRootPath()}/download`,
  DOWNLOAD_SONG: `${getRootPath()}/download/song`,
  DOWNLOAD_MV: `${getRootPath()}/download/mv`,
   DOWNLOAD_PIC: `${getRootPath()}/download/pictures`, 
  DOWNLOAD_LRC: `${getRootPath()}/download/lrcs`,     
};

const ensureStoragePermission = (): boolean => {
  const native = getNative();
  if (!native) return false;
  try {
    const has = native.system?.hasStorage?.();
    if (has === false) {
      native.system?.requestStorage?.();
      return false;
    }
  } catch {
    // 部分环境没有权限检测，继续执行
  }
  return true;
};

const ensureDir = (path: string) => {
  try {
    getNative()?.file?.save?.(path, null);
  } catch {
    // directory may already exist; ignore
  }
};

const checkFileExists = (native: ReturnType<typeof getNative>, path: string): boolean => {
  try {
    return !!native?.file?.exists?.(path);
  } catch {
    return false;
  }
};

export const initFileSystem = () => {
  if (!ensureStoragePermission()) return false;
  [
    PATHS.ROOT,
    PATHS.BACKUP,
    PATHS.DOWNLOAD_ROOT,
    PATHS.DOWNLOAD_SONG,
    PATHS.DOWNLOAD_MV,
    PATHS.DOWNLOAD_PIC,
    PATHS.DOWNLOAD_LRC,
  ].forEach(ensureDir);
  return true;
};

const encodeToDataUrl = (content: string, mime = 'application/octet-stream', alreadyBase64 = false) => {
  if (alreadyBase64) return `data:${mime};base64,${content}`;
  const base64 = btoa(unescape(encodeURIComponent(content)));
  return `data:${mime};base64,${base64}`;
};

const encodeToBase64 = (content: string) => btoa(unescape(encodeURIComponent(content)));
// 增加保存文本文件（歌词）的辅助函数
export const saveTextFile = (filename: string, content: string, subDir = 'lrcs'): string | null => {
    if (!initFileSystem()) return null;
    const native = getNative();
    const dir = subDir === 'lrcs' ? PATHS.DOWNLOAD_LRC : PATHS.DOWNLOAD_PIC;
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    const fullPath = `${dir}/${safeName}`;
    ensureDir(dir);
    
    try {
        // 直接保存文本内容
        const res = native?.file?.save?.(fullPath, content);
        if (res !== false) return fullPath;
    } catch {}
    return null;
}
const decodeBase64ToString = (content?: string | null) => {
  if (!content) return null;
  const base64 = content.startsWith('data:') ? content.split(',')[1] : content;
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return null;
  }
};

const nowStamp = () => {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}_${String(n.getHours()).padStart(2, '0')}${String(n.getMinutes()).padStart(2, '0')}${String(n.getSeconds()).padStart(2, '0')}`;
};

type SaveBackupOptions = {
  fileName?: string;
  overwrite?: boolean;
  silent?: boolean;
};

export const saveBackupToFile = (data: string, prefix = 'backup', options: SaveBackupOptions = {}): boolean => {
  if (!initFileSystem()) return false;
  const native = getNative();
  const filename = options.fileName || `${prefix}_${nowStamp()}.json`;
  const fullPath = `${PATHS.BACKUP}/${filename}`;
  ensureDir(PATHS.BACKUP);
  const exists = () => checkFileExists(native, fullPath);
  if (exists() && options.overwrite === false) {
    if (!options.silent) toast(`备份已存在: ${filename}`);
    return true;
  }

  const trySave = (payload: string | null) => {
    try {
      const res = native?.file?.save?.(fullPath, payload);
      if (res !== false || exists()) return true;
    } catch {
      if (exists()) return true;
    }
    return false;
  };

  const base64 = encodeToBase64(data);
  const ok =
    trySave(base64) ||
    trySave(`data:application/json;base64,${base64}`) ||
    trySave(data) ||
    exists();

  if (!ok) {
    if (!options.silent) toast('备份写入失败，请检查存储权限');
    return false;
  }
  if (!options.silent) toast(`备份完成: ${filename}`);
  return true;
};

export const getBackupList = (): string[] => {
  if (!ensureStoragePermission()) return [];
  const native = getNative();
  try {
    const list = native?.file?.list?.(PATHS.BACKUP);
    if (!list || list === 'null') return [];
    return list
      .split(/[\\/]/)
      .map((n: string) => n.replace(/\/$/, ''))
      .filter((n: string) => n.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
};

export const readBackupFile = (filename: string): string | null => {
  if (!ensureStoragePermission()) return null;
  const native = getNative();
  const path = `${PATHS.BACKUP}/${filename}`;
  try {
    const raw = native?.file?.read?.(path);
    const text = decodeBase64ToString(raw);
    if (!text) toast('读取备份失败');
    return text;
  } catch {
    toast('读取备份失败');
    return null;
  }
};

const getDownloadDirByType = (type: 'song' | 'mv' | 'picture') => {
  if (type === 'mv') return PATHS.DOWNLOAD_MV;
  if (type === 'picture') return PATHS.DOWNLOAD_PIC;
  return PATHS.DOWNLOAD_SONG;
};

export const saveDownloadedMedia = (
  filename: string,
  contentBase64: string,
  type: 'song' | 'mv' | 'picture' = 'song',
  mime?: string
): string | null => {
  if (!initFileSystem()) return null;
  const native = getNative();
  if (!native?.file?.save) {
    console.error('saveDownloadedMedia: native file.save not available');
    toast('保存失败：存储接口不可用');
    return null;
  }
  const dir = getDownloadDirByType(type);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const fullPath = `${dir}/${safeName}`;
  ensureDir(dir);
  const exists = () => checkFileExists(native, fullPath);

  const base64Only = contentBase64.startsWith('data:') ? contentBase64.split(',')[1] : contentBase64;
  const dataUrlPayload = contentBase64.startsWith('data:')
    ? contentBase64
    : encodeToDataUrl(contentBase64, mime || 'application/octet-stream', true);

  let lastError = '';
  const trySave = (payload: string | null, label: string) => {
    try {
      const res = native.file?.save?.(fullPath, payload);
      if (res !== false || exists()) return true;
      lastError = `接口返回 ${String(res) || 'false'} (${label})`;
      console.error('saveDownloadedMedia: save returned false', { fullPath, label, res });
    } catch (e: any) {
      if (exists()) return true;
      lastError = e?.message || String(e);
      console.error('saveDownloadedMedia error', label, e);
    }
    return false;
  };

  const ok =
    trySave(base64Only, 'base64') ||
    trySave(dataUrlPayload, 'dataUrl') ||
    trySave(contentBase64, 'raw-input') ||
    exists();

  if (!ok) {
    toast(`保存失败：${lastError || '请检查存储权限或路径'}`);
    return null;
  }
  toast(`已保存到 ${safeName}`);
  return fullPath;
};

export const readFileAsText = (path: string): string | null => {
  if (!ensureStoragePermission()) return null;
  const native = getNative();
  try {
    const raw = native?.file?.read?.(path);
    return decodeBase64ToString(raw);
  } catch {
    toast('读取文件失败');
    return null;
  }
};

export const deleteFileSafely = (path?: string) => {
  if (!path || !ensureStoragePermission()) return false;
  try {
    const ok = getNative()?.file?.delete?.(path);
    if (ok === false) toast('删除失败');
    return ok !== false;
  } catch {
    toast('删除失败');
    return false;
  }
};

export const openFile = (path: string) => {
  try {
    getNative()?.file?.open?.(path);
  } catch {
    toast('无法打开文件');
  }
};

export const renameFile = (path: string, newName: string) => {
  try {
    getNative()?.file?.rename?.(path, newName);
    toast('已重命名');
    return true;
  } catch {
    toast('重命名失败');
    return false;
  }
};

export const toFileUrl = (path: string) => (path.startsWith('file://') ? path : `file://${encodeURI(path)}`);

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
