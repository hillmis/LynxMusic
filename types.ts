// --- START OF FILE types.ts ---

declare global {
  interface Window {
    /**
     * 统一的 WebIDE 原生功能接口
     * 建议通过 APP.ITAPI.DEV 调用
     */
    APP: {
      ITAPI: {
        DEV: WebAppNativeAPI;
      };
    };
    /** 兼容底层调用，仅保留映射后的命名空间 */
    webapp: WebAppNativeAPI;
  }
}

/**
 * 原生功能分类定义
 */
export interface WebAppNativeAPI {
  /** 应用基础信息 */
  app: {
    getName: () => string;
    getPackageName: () => string;
    getVersionName: () => string;
    getVersionCode: () => number;
    getDeviceId: () => string;
    getSignature: () => string;
    getClipboard: () => string;
    copy: (text: string) => void;
  };

  /** 悬浮窗控制 */
  overlay: {
    launch: (url: string, w: number, h: number, hideBar: boolean, x: number, y: number) => void;
    close: () => void;
    minimize: () => void;
    resize: (w: number, h: number) => void;
    move: (x: number, y: number) => void;
    setFocus: (focus: boolean) => void;
    showToolbar: (show: boolean) => void;
    hasPermission: () => boolean;
    requestPermission: () => void;
  };

  /** 界面与应用控制 */
  control: {
    launchApp: (pkg: string) => void;
    exists: (pkg: string) => boolean;
    uninstall: (pkg: string) => void;
    setDownloadPrompt: (enable: boolean) => void;
    setDownloadEnabled: (enable: boolean) => void;
    listenExternalLink: (callbackName: string) => void;
    openInBrowser: (url: string) => void;
    openLocalPage: (path: string) => void;
    loadSource: (url: string, html: string) => void;
    clearHistory: () => void;
    setFullscreen: (enable: boolean) => void;
    setLandscape: (enable: boolean) => void;
    setPortrait: (enable: boolean) => void;
    setDarkMode: (enable: boolean) => void;
    setPullRefresh: (enable: boolean) => void;
    setLoadingEffect: (enable: boolean) => void;
    setCustomBackKey: (script: string | null) => void;
    setVolumeKey: (isUp: boolean, script: string | null) => void;
    setUserAgent: (ua: string | null) => void;
    setLongPressEvent: (callbackName: string) => void;
    addShortcut: (name: string, icon: string, script: string, id: number, isLongPress: boolean) => void;
    removeShortcut: (id: number) => void;
    isShortcutSupported: () => boolean;
  };

  /** 系统权限、硬件与反馈 */
  system: {
    // 权限管理
    hasStorage: () => boolean;
    requestStorage: () => void;
    onStorageResult: (callbackName: string) => void;
    hasInstall: () => boolean;
    requestInstall: () => void;
    hasNotify: () => boolean;
    requestNotify: () => void;
    hasNotifyPermission: () => boolean;
    requestIgnoreBattery: () => void;
    setBackgroundRunning: (enable: boolean) => void;
    startPip: (widthRatio: number, heightRatio: number, callbackName?: string) => void;
    isPipSupported: () => boolean;
    
    // 交互反馈
    toast: (msg: string) => void;
    shareText: (text: string) => void;
    notify: (id: number, title: string, content: string, script: string) => void;
    removeNotify: (id: number) => void;
    
    // 硬件控制
    getBrightness: () => number;
    setBrightness: (val: number) => void;
    getVolume: () => number;
    setVolume: (val: number) => void;
    setScreenOn: (on: boolean) => void;
    setStatusBarColor: (hex: string | null) => void;
    
    // 状态
    isVpnActive: () => boolean;
    getApiLevel: () => number;
    exit: () => void;
    goHome: () => void;
  };

  /** 文件系统操作 (已合并冗余接口) */
  file: {
    getRootDir: () => string;      // /storage/emulated/0
    getExternalFilesDir: () => string;  // Android/data/pkg/files
    getInternalFilesDir: () => string;  // /data/data/pkg/files
    /** 兼容旧命名 */
    getExternalDir?: () => string;
    getInternalDir?: () => string;
    
    /** 遍历目录。替代 listfile / 获取目录排列 */
    list: (path: string) => string;
    /** 读取文件内容(Base64)。替代 gainfile / 获取文件内容 */
    read: (path: string) => string;
    /** 获取文件大小。替代 gainsize / 获取文件大小 */
    size: (path: string) => number;
    /** 保存/创建文件夹。data为null时创建文件夹 */
    save: (path: string, data: string | null) => boolean;
    append: (path: string, data: string) => void;
    delete: (path: string) => boolean;
    rename: (path: string, newName: string) => void;
    exists: (path: string) => boolean;
    open: (path: string) => void;
    share: (path: string) => void;
    getAsset: (name: string) => string;
    /** 保存文件到系统 Download 目录 */
    downloadSave: (name: string, data: string) => void;
  };

  /** 数据持久化 (类似 LocalStorage) */
  storage: {
    set: (key: string, val: string) => void;
    get: (key: string, def: string) => string;
    setBool: (key: string, val: boolean) => void;
    getBool: (key: string, def: boolean) => boolean;
    remove: (key: string) => void;
    clear: () => void;
  };

  /** 专家/进阶功能 */
  expert: {
    executeJava: (code: string) => void;
    executeShell: (path: string, env: string, cmd: string, cb: string) => void;
    sendBroadcast: (action: string, tag: string, data: string) => void;
    registerReceiver: (action: string, tag: string, cb: string) => void;
    stopReceiver: () => void;
    setIntercept: (rules: string) => void;
    setDebug: (enable: boolean) => void;
    clearCache: () => void;
    clearWebCache?: () => void;
    setNoCache: (enable: boolean) => void;
    getProtocol: () => string;
  };
}

// --- 业务模型定义 (保持不变) ---

export type MusicSource =
  | 'local'
  | 'download'
  | 'qq'
  | 'netease'
  | 'kugou'
  | 'kuwo'
  | 'migu'
  | 'unknown';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  quality?: string;
  path?: string;
  source?: MusicSource;
  url?: string;
  coverUrl?: string;
  mvUrl?: string;
  apiKeyword?: string;
  isDetailsLoaded?: boolean;
  addedAt?: number;
  lyric?: string;
}

export interface Playlist {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  coverImgStack?: string[];
  songCount: number;
  description?: string;
  apiKeyword?: string;
  songs?: Song[];
  isLocal?: boolean;
  createdAt?: number;
  updatedAt?: number;
  source?: 'local' | 'qq' | 'kw' | 'wy' | 'kg';
}

export interface Task {
  id: string;
  title: string;
  reward: string;
  completed: boolean;
}

export type DownloadType = 'song' | 'mv' | 'picture';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface DownloadTask {
  id: string;
  songId?: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  type: DownloadType;
  status: DownloadStatus;
  progress: number;
  createdAt: number;
  path?: string;
  error?: string;
  fileSize?: number;
  /** 下载链接（本地 file:// 或远程 http/https） */
  url?: string;
  /** 建议保存的扩展名（含 .） */
  ext?: string;
  /** 建议保存的文件名（不含扩展名时会自动补全） */
  fileName?: string;
  /** MIME 类型提示 */
  mime?: string;
  /** 来源路径提示（用于本地复制时推断扩展名） */
  pathHint?: string;
}

export enum Tab {
  HOME = 'HOME',
  DISCOVER = 'DISCOVER',
  LOCAL = 'LOCAL',
  MINE = 'MINE',
  PLAYING = 'PLAYING',
}

export type SubView =
  | { type: 'NONE' }
  | { type: 'CHECK_IN' }
  | { type: 'PLAYLIST_DETAIL'; playlist: Playlist }
  | { type: 'SEE_ALL_SONGS' }
  | { type: 'SEE_ALL_PLAYLISTS' }
  | { type: 'CHART_DETAIL'; title: string; gradient: string; chartId: string }
  | { type: 'SETTINGS' }
  | { type: 'STATISTIC_DETAIL' }
  | { type: 'RECENT' }
  | { type: 'DOWNLOADS' };
