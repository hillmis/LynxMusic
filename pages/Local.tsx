import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MoreVertical, Play, Search,
  ArrowUpDown, ScanLine, Image, Trash2, HardDrive,
  Folder, ChevronRight, FolderOpen, RefreshCw,
  Smartphone, Loader2, Music, ListMusic, X, ArrowLeft, Video, Share2,
  Radar, Fingerprint
} from 'lucide-react';
import { Song } from '../types';
import { dbGetLocalSongs, dbSaveLocalSong, dbClearLocalSongs, dbDeleteLocalSong } from '../utils/db';
import { useSongActions } from '../hooks/useSongActions';
import SongActionSheet from '../components/SongActionSheet';
import { getNative, safeToast, PATHS, saveTextFile, saveDownloadedMedia } from '../utils/fileSystem';
import { fetchSongDetail, searchMusic } from '../utils/api';

// --- 类型声明 ---
type SourceType = 'download' | 'qq' | 'wy' | 'kw' | 'kg' | 'lynx' | 'local' | string;
type QualityType = 'SQ' | 'HQ' | 'STD' | 'Local';

declare const jsmediatags: any;

interface LocalSong extends Song {
  addDate: number;
  playCount: number;
  source: SourceType;
  quality: QualityType;
}

interface LocalMV {
  id: string;
  title: string;
  coverUrl: string;
  duration: string;
  size: string;
  path: string;
  artist: string;
  mvUrl?: string;
  url?: string;
}

interface LocalFolder {
  id: string;
  name: string;
  path: string;
  songCount: number;
  sourceIcon?: SourceType;
}

interface ScanStats {
  total: number;
  scanned: number;
  failed: number;
  currentApp: string;
}

interface LocalProps {
  onPlaySong: (song: Song) => void;
  onPlayList: (songs: Song[], startIndex?: number) => void;
  onAddToQueue: (song: Song) => void;
  onAddToNext?: (song: Song) => void;
}

// --- 配置常量 ---
const AUDIO_FORMATS = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.amr'];
const VIDEO_FORMATS = ['.mp4', '.mkv', '.avi', '.3gp', '.webm', '.mov'];
const SUPPORTED_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS];

// --- 过滤阈值配置 ---
// 音频文件小于 500KB 通常是铃声、通知音或损坏文件
const MIN_AUDIO_SIZE = 1024 * 500;
// 视频文件小于 2MB 通常是缓存片段或非完整MV
const MIN_VIDEO_SIZE = 1024 * 1024 * 2;

// 忽略扫描的系统/缓存目录 (提高全盘扫描效率)
const IGNORE_DIRS = [
  '/Android/data', '/Android/obb', '/.thumbnail', '/cache', '/log', '/temp', '/backups',
  '/.git', '/node_modules', '/Code', '/Alipay', '/Tencent/MicroMsg', '/DingTalk', '/bilibili', '/DCIM/Camera'
];

const SHARE_TEXT = '来Lynx Music遇见知音，下载更新地址：\nhttps://pan.quark.cn/s/be0691bb5331#/';

// --- 核心配置：媒体路径 ---
const MEDIA_STORAGE_PATHS: Record<string, string[]> = {
  // 音乐应用路径
  'LynxMusic': [
    '/storage/emulated/0/LynxMusic/download/'
  ],
  'HillMusic': [
    '/storage/emulated/0/HillMusic/'
  ],
  '网易云音乐': [
    '/storage/emulated/0/netease/cloudmusic/Music/',
    '/storage/emulated/0/Netease/CloudMusic/Download/',
    '/storage/emulated/0/Music/',
    '/storage/emulated/0/Android/data/com.netease.cloudmusic/files/Download/'
  ],
  'QQ音乐': [
    '/storage/emulated/0/qqmusic/song/',
    '/storage/emulated/0/Android/data/com.tencent.qqmusic/files/QQMusic/song/'
  ],
  '酷狗音乐': [
    '/storage/emulated/0/kgmusic/download/',
    '/storage/emulated/0/KuGou/Music/',
    '/storage/emulated/0/Android/data/com.kugou.android/files/KuGou/Music/'
  ],
  '酷我音乐': [
    '/storage/emulated/0/KwDownload/download/',
    '/storage/emulated/0/KuwoMusic/music/',
    '/storage/emulated/0/Android/data/cn.kuwo.player/files/KuwoMusic/music/'
  ],
  '咪咕音乐': [
    '/storage/emulated/0/migu/mp3/'
  ],

  // 通用媒体目录
  '下载': [
    '/storage/emulated/0/Download/',
    '/storage/emulated/0/Downloads/'
  ],
  '音乐': [
    '/storage/emulated/0/Music/',
    '/storage/emulated/0/Music/download/',
    '/storage/emulated/0/Media/Music/'
  ],
  '视频': [
    '/storage/emulated/0/Movies/',
    '/storage/emulated/0/Videos/',
    '/storage/emulated/0/DCIM/',
    '/storage/emulated/0/Pictures/'
  ],
  '其他': [
    '/storage/emulated/0/Media/',
    '/storage/emulated/0/Audio/',
    '/storage/emulated/0/Sounds/',
    '/storage/emulated/0/Recordings/'
  ]
};

const parseNativeList = (listStr?: string | null) => {
  if (!listStr || listStr === 'null') return [];
  return listStr
    .split(/[\\/\n]/)
    .map(f => f.trim())
    .filter(f => f && f !== '.' && f !== '..')
    .map(f => f.split(/[\\/]/).pop() || '');
};

const isBackupPath = (path: string) => {
  const clean = path.replace(/\/+$/, '').toLowerCase();
  return clean === PATHS.BACKUP.replace(/\/+$/, '').toLowerCase() || clean.endsWith('/backup');
};

// 修复：支持从数组配置中检测来源
const detectSourceFromPath = (path?: string): SourceType => {
  if (!path) return 'local';
  const normalized = path.toLowerCase();

  for (const [appName, paths] of Object.entries(MEDIA_STORAGE_PATHS)) {
    for (const dir of paths) {
      // 简单的大小写不敏感匹配
      if (normalized.includes(dir.toLowerCase().replace(/\/$/, ''))) {
        // 返回标准化标识
        if (appName.includes('QQ')) return 'qq';
        if (appName.includes('网易')) return 'wy';
        if (appName.includes('酷我')) return 'kw';
        if (appName.includes('酷狗')) return 'kg';
        if (appName.includes('Lynx')) return 'lynx';
        if (appName.includes('下载')) return 'download';
        if (appName.includes('咪咕')) return 'migu';
        return appName;
      }
    }
  }
  return 'local';
};

// --- 辅助组件 ---
const SourceBadge: React.FC<{ source: SourceType }> = ({ source }) => {
  let color = 'bg-slate-600';
  let label = source;

  const src = (source || '').toString().toLowerCase();
  if (src.includes('qq')) { color = 'bg-green-600'; label = 'QQ'; }
  else if (src.includes('wy') || src.includes('netease')) { color = 'bg-red-600'; label = 'WY'; }
  else if (src.includes('kw') || src.includes('酷我')) { color = 'bg-yellow-600'; label = 'KW'; }
  else if (src.includes('kg') || src.includes('酷狗')) { color = 'bg-blue-600'; label = 'KG'; }
  else if (src.includes('lynx') || src.includes('hill')) { color = 'bg-indigo-600'; label = 'Lynx'; }
  else if (src.includes('migu')) { color = 'bg-pink-600'; label = 'MG'; }
  else if (src.includes('download') || src.includes('dl')) { color = 'bg-purple-600'; label = 'DL'; }
  else if (src.includes('视频') || src.includes('video')) { color = 'bg-orange-600'; label = 'Video'; }
  else { label = 'Local'; }

  return (
    <span className={`${color} text-[9px] px-1.5 py-0.5 rounded text-white font-medium mr-1.5 align-middle shrink-0`}>
      {label}
    </span>
  );
};

const QualityBadge: React.FC<{ quality: QualityType }> = ({ quality }) => {
  if (quality === 'STD' || quality === 'Local') return null;
  return (
    <span className="border border-indigo-400 text-indigo-400 text-[8px] px-0.5 rounded ml-1.5 font-bold">
      {quality}
    </span>
  );
};

const fixEncoding = (text: string): string => {
  if (!text) return text;
  try {
    if (/[\u4e00-\u9fa5]/.test(text)) return text;
    const decoded = decodeURIComponent(escape(text));
    return decoded;
  } catch {
    return text;
  }
};

// --- 主组件 ---
const Local: React.FC<LocalProps> = ({ onPlaySong, onPlayList, onAddToQueue, onAddToNext }) => {
  const [activeTab, setActiveTab] = useState<'music' | 'mv' | 'folder'>('music');
  const [showSettings, setShowSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSilentScanning, setIsSilentScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingFolder, setViewingFolder] = useState<string | null>(null);

  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [localMvs, setLocalMvs] = useState<LocalMV[]>([]);
  const [localFolders, setLocalFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const nativeRef = useRef(getNative());
  const toast = safeToast;
  const [refreshingFolder, setRefreshingFolder] = useState(false);
  const [songSort, setSongSort] = useState<'name' | 'date' | 'count'>('date');

  const cancelScanRef = useRef(false);
  const autoRefreshRef = useRef(false);

  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const songActions = useSongActions({ addToQueue: onAddToQueue, addToNext: onAddToNext });
  const [isMatching, setIsMatching] = useState(false);

  const loadSongsFromDB = useCallback(async () => {
    if (!isSilentScanning) setLoading(true);
    try {
      const allItems = await dbGetLocalSongs();

      const songs: LocalSong[] = [];
      const mvs: LocalMV[] = [];
      const folderMap = new Map<string, LocalFolder>();

      allItems.forEach((item: any) => {
        const isVideo = item.path && VIDEO_FORMATS.some(ext => item.path!.toLowerCase().endsWith(ext));

        if (isVideo) {
          mvs.push({
            id: item.id,
            title: item.title,
            artist: item.artist,
            coverUrl: item.coverUrl || '',
            duration: '--:--',
            size: '未知',
            path: item.path!,
            mvUrl: item.mvUrl || (item.path ? `file://${item.path}` : ''),
            url: item.mvUrl || (item.path ? `file://${item.path}` : '')
          });
        } else {
          const storedDate = item.addDate || item.createdAt;
          const dateVal = typeof storedDate === 'number' ? storedDate : (storedDate ? new Date(storedDate).getTime() : Date.now());

          songs.push({
            ...item,
            addDate: dateVal,
            playCount: item.playCount || 0,
            source: (item.source as SourceType) || detectSourceFromPath(item.path),
            quality: 'Local' as QualityType
          });
        }

        if (item.path) {
          const lastSlash = item.path.lastIndexOf('/');
          const folderPath = lastSlash > -1 ? item.path.substring(0, lastSlash) : 'root';
          const folderName = folderPath.split('/').pop() || 'unknown';
          if (isBackupPath(folderPath)) return;

          if (!folderMap.has(folderPath)) {
            let srcIcon = detectSourceFromPath(folderPath);
            folderMap.set(folderPath, {
              id: `folder_${folderPath}`,
              name: folderName,
              path: folderPath,
              songCount: 0,
              sourceIcon: srcIcon
            });
          }
          folderMap.get(folderPath)!.songCount++;
        }
      });

      setLocalSongs(songs);
      setLocalMvs(mvs);
      setLocalFolders(Array.from(folderMap.values()));

    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilentScanning) setLoading(false);
    }
  }, [isSilentScanning]);

  useEffect(() => {
    loadSongsFromDB();
  }, [loadSongsFromDB]);

  // --- 快速扫描下载目录 ---
  const quickScanlynxDownloads = useCallback(async () => {
    const native = nativeRef.current;
    if (!native || isScanning || autoRefreshRef.current) return;
    autoRefreshRef.current = true;
    try {
      const lynxDirs = MEDIA_STORAGE_PATHS['LynxMusic'] || [];
      let added = 0;
      for (const dir of lynxDirs) {
        const cleanPath = dir.replace(/\/$/, '');
        try {
          if (native.file?.list?.(cleanPath) !== "null") {
            added += await scanDirectory(cleanPath, 'lynx');
          }
        } catch { }
      }
      if (added > 0) {
        await loadSongsFromDB();
      }
    } finally {
      autoRefreshRef.current = false;
    }
  }, [isScanning, loadSongsFromDB]);

  // --- 文件夹同步逻辑 ---
  const syncFoldersFromSystem = useCallback(() => {
    const folderMap = new Map<string, LocalFolder>();
    const addFolder = (path?: string) => {
      if (!path) return;
      const lastSlash = path.lastIndexOf('/');
      const folderPath = lastSlash > -1 ? path.substring(0, lastSlash) : 'root';
      if (isBackupPath(folderPath)) return;
      const folderName = folderPath.split('/').pop() || 'unknown';
      if (!folderMap.has(folderPath)) {
        folderMap.set(folderPath, {
          id: `folder_${folderPath}`,
          name: folderName,
          path: folderPath,
          songCount: 0,
          sourceIcon: detectSourceFromPath(folderPath)
        });
      }
      const target = folderMap.get(folderPath);
      if (target) target.songCount += 1;
    };

    localSongs.forEach(s => addFolder(s.path));
    localMvs.forEach(m => addFolder(m.path));

    const next = Array.from(folderMap.values()).filter(f => f.songCount > 0);
    if (next.length > 0 || localFolders.length === 0) {
      setLocalFolders(next);
    }
  }, [localFolders.length, localMvs, localSongs]);

  const refreshFolderFromFS = useCallback(async (folderPath: string, silent = false) => {
    const native = nativeRef.current;
    if (!folderPath || !native) {
      if (!silent) toast('需要在应用环境下管理本地文件库');
      return;
    }
    if (isScanning || refreshingFolder) return;
    setRefreshingFolder(true);
    cancelScanRef.current = false;
    try {
      const existing = await dbGetLocalSongs();
      const folderItems = existing.filter(item => item.path && item.path.startsWith(folderPath));
      for (const item of folderItems) {
        try {
          const exists = native.file?.exists?.(item.path!);
          if (exists === false) {
            await dbDeleteLocalSong(item.path!);
          }
        } catch { }
      }
      await scanDirectory(folderPath, detectSourceFromPath(folderPath));
      await loadSongsFromDB();
    } finally {
      setRefreshingFolder(false);
    }
  }, [isScanning, loadSongsFromDB, refreshingFolder, toast]);

  useEffect(() => {
    const handler = async () => {
      await quickScanlynxDownloads();
      await loadSongsFromDB();
      syncFoldersFromSystem();
    };
    window.addEventListener('hm-local-refresh', handler);
    return () => window.removeEventListener('hm-local-refresh', handler);
  }, [quickScanlynxDownloads, loadSongsFromDB, syncFoldersFromSystem]);

  const availableTabs = [
    { key: 'music', label: '歌曲', count: localSongs.length },
    { key: 'mv', label: 'MV', count: localMvs.length },
    { key: 'folder', label: '文件夹', count: localFolders.length }
  ];

  useEffect(() => {
    if (availableTabs.length > 0) {
      const exists = availableTabs.some(t => t.key === activeTab);
      if (!exists) setActiveTab(availableTabs[0].key as any);
    }
  }, [localSongs.length, localMvs.length, localFolders.length]);

  useEffect(() => {
    if (activeTab === 'folder' && !refreshingFolder && !loading) {
      syncFoldersFromSystem();
    }
  }, [activeTab, loading, refreshingFolder, localSongs.length, localMvs.length, syncFoldersFromSystem]);

  const sortedSongs = useMemo(() => {
    return [...localSongs].sort((a, b) => {
      if (songSort === 'name') return a.title.localeCompare(b.title, 'zh-CN');
      if (songSort === 'count') return b.playCount - a.playCount;
      return b.addDate - a.addDate;
    });
  }, [localSongs, songSort]);

  const displayItems = useMemo(() => {
    let items: (LocalSong | LocalMV)[] = [];
    if (activeTab === 'folder' && viewingFolder) {
      const folderSongs = sortedSongs.filter(s => s.path?.startsWith(viewingFolder));
      const folderMvs = localMvs.filter(m => m.path.startsWith(viewingFolder));
      return [...folderSongs, ...folderMvs];
    } else if (activeTab === 'music') {
      return sortedSongs;
    } else {
      return [];
    }
  }, [sortedSongs, localMvs, activeTab, viewingFolder]);

  const filteredDisplayItems = useMemo(() => {
    if (!searchTerm) return displayItems;
    const lower = searchTerm.toLowerCase();
    return displayItems.filter(item =>
      item.title.toLowerCase().includes(lower) ||
      (item.artist && item.artist.toLowerCase().includes(lower))
    );
  }, [displayItems, searchTerm]);

  const displayMvs = useMemo(() => {
    if (!searchTerm) return localMvs;
    const lower = searchTerm.toLowerCase();
    return localMvs.filter(m =>
      m.title.toLowerCase().includes(lower) ||
      (m.artist && m.artist.toLowerCase().includes(lower))
    );
  }, [localMvs, searchTerm]);

  const displayFolders = useMemo(() => {
    if (!searchTerm) return localFolders.filter(f => f.songCount > 0);
    const lower = searchTerm.toLowerCase();
    return localFolders
      .filter(f => f.songCount > 0)
      .filter(f => f.name.toLowerCase().includes(lower));
  }, [localFolders, searchTerm]);

  const handlePlaySong = (song: LocalSong) => {
    const playableUrl = song.url || (song.path ? `file://${song.path}` : '');
    if (!playableUrl) {
      toast('未找到本地播放地址');
      return;
    }
    onPlaySong({ ...song, url: playableUrl });
  };

  const resolveLocalMvUrl = (mv: LocalMV | any): string | null => {
    const filePath = mv.path;
    if (filePath) {
      const localUrl = `file://${filePath}`;
      const native = nativeRef.current;
      if (!native) return mv.mvUrl || mv.url || localUrl;
      try {
        const size = native.file?.size?.(filePath);
        if (typeof size === 'number' && size > 0) return localUrl;
      } catch { }
      if (mv.mvUrl || mv.url) return mv.mvUrl || mv.url;
      return localUrl;
    }
    return mv.mvUrl || mv.url || null;
  };

  const handlePlayMV = (mv: LocalMV | any) => {
    const mvUrl = resolveLocalMvUrl(mv);
    if (!mvUrl) {
      toast('未找到本地或在线 MV');
      return;
    }
    const videoSong: Song = {
      id: mv.id,
      title: mv.title,
      artist: mv.artist || '未知艺术家',
      coverUrl: mv.coverUrl || '',
      url: mvUrl,
      mvUrl: mvUrl,
      path: mv.path,
      source: mvUrl.startsWith('file://') ? 'local' : 'download',
      isDetailsLoaded: true
    };
    window.dispatchEvent(new CustomEvent('hm-play-mv', { detail: videoSong }));
    toast('正在打开视频...');
  };

  const handleItemClick = (item: LocalSong | LocalMV) => {
    if ('duration' in item && 'size' in item) {
      handlePlayMV(item);
    } else {
      handlePlaySong(item as LocalSong);
    }
  };

  const handleFolderClick = (folder: LocalFolder) => {
    setViewingFolder(folder.path);
    setSearchTerm('');
    refreshFolderFromFS(folder.path);
  };

  const handleDeleteLocal = async (item: LocalSong | LocalMV) => {
    if (!item.path) return;
    try {
      const native = nativeRef.current;
      if (native) {
        try {
          const has = native.system?.hasStorage?.();
          if (has === false) native.system?.requestStorage?.();
        } catch { }
        const res = native.file?.delete?.(item.path);
        if (res === false) {
          const stillExists = native.file?.exists?.(item.path) !== false;
          if (stillExists) {
            toast('删除失败，接口不可用');
            return;
          }
        }
      }
    } catch { }

    await dbDeleteLocalSong(item.path);
    setLocalSongs(prev => prev.filter(s => s.path !== item.path));
    setLocalMvs(prev => prev.filter(m => m.path !== item.path));
    setLocalFolders(prev => {
      const updated = prev.map(f => f.path === item.path?.substring(0, item.path.lastIndexOf('/'))
        ? { ...f, songCount: Math.max(0, f.songCount - 1) }
        : f);
      return updated.filter(f => f.songCount > 0);
    });
    syncFoldersFromSystem();
    toast('已删除本地文件');
  };

  // --- 常用目录快速扫描 ---
  const handleFastScan = async () => {
    if (isScanning || isSilentScanning) {
      cancelScanRef.current = true;
      setIsScanning(false);
      setIsSilentScanning(false);
      setScanStatus('已停止扫描');
      return;
    }

    const native = nativeRef.current;
    if (!native) {
      alert('需在 App 环境中运行');
      return;
    }

    // 权限请求
    try {
      const has = native.system?.hasStorage?.();
      if (has === false) {
        native.system?.requestStorage?.();
        toast('请授予存储权限');
        return;
      }
    } catch (e) { }

    setIsScanning(true);
    cancelScanRef.current = false;
    setScanProgress(0);
    setScanStatus('准备开始扫描...');
    setShowSettings(false); // 关闭弹窗

    // 默认清空旧数据
    await dbClearLocalSongs();
    setLocalSongs([]);
    setLocalMvs([]);
    setLocalFolders([]);

    // 内部定义递归扫描函数
    const scanPathRecursive = async (currentPath: string, sourceName: string): Promise<number> => {
      if (cancelScanRef.current) return 0;
      // 跳过忽略目录
      if (IGNORE_DIRS.some(ignored => currentPath.includes(ignored))) return 0;

      let foundCount = 0;
      try {
        const filesStr = native.file?.list?.(currentPath);
        const items = parseNativeList(filesStr);
        if (!items.length) return 0;

        for (const item of items) {
          if (cancelScanRef.current) break;
          const fullPath = `${currentPath}/${item}`;
          const lowerItem = item.toLowerCase();

          const isAudio = AUDIO_FORMATS.some(ext => lowerItem.endsWith(ext));
          const isVideo = VIDEO_FORMATS.some(ext => lowerItem.endsWith(ext));

          if (isAudio || isVideo) {
            // --- 增加文件大小/时长过滤 ---
            try {
              const size = native.file?.size?.(fullPath);
              if (typeof size === 'number') {
                if (isAudio && size < MIN_AUDIO_SIZE) continue; // 忽略短音频
                if (isVideo && size < MIN_VIDEO_SIZE) continue; // 忽略短视频
              }
            } catch { }

            try {
              const songInfo = await parseMusicFile(fullPath, item, sourceName);
              await dbSaveLocalSong(songInfo);
              foundCount++;
            } catch { }
          } else if (!item.includes('.')) {
            // 如果不是文件（无扩展名），尝试递归
            // 稍微释放主线程
            await new Promise(r => setTimeout(r, 0));
            foundCount += await scanPathRecursive(fullPath, sourceName);
          }
        }
      } catch (e) { }
      return foundCount;
    };

    try {
      // 展平所有配置路径
      const allPaths: { app: string, path: string }[] = [];
      Object.entries(MEDIA_STORAGE_PATHS).forEach(([app, paths]) => {
        paths.forEach(p => allPaths.push({ app, path: p }));
      });

      let totalFound = 0;
      for (let i = 0; i < allPaths.length; i++) {
        if (cancelScanRef.current) break;
        const { app, path } = allPaths[i];

        setScanStatus(`扫描: ${app}`);
        setScanProgress(((i) / allPaths.length) * 100);

        try {
          const cleanPath = path.replace(/\/$/, '');
          // 仅当目录存在时扫描，使用递归扫描
          if (native.file?.exists?.(cleanPath)) {
            const found = await scanPathRecursive(cleanPath, app);
            totalFound += found;
          }
        } catch { }
        // 稍微让渡一下 UI
        await new Promise(r => setTimeout(r, 10));
      }

      setScanStatus(cancelScanRef.current ? '扫描已取消' : `扫描完成`);
      setScanProgress(100);
      toast(`快速扫描完成，找到 ${totalFound} 个文件`);
      loadSongsFromDB();

    } catch (error: any) {
      setScanStatus(`出错: ${error.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // --- 深度全盘静默扫描 ---
  const handleFullSilentScan = async () => {
    if (isScanning || isSilentScanning) {
      toast('已有扫描任务正在进行');
      return;
    }

    const native = nativeRef.current;
    if (!native) return;

    setIsSilentScanning(true);
    cancelScanRef.current = false;
    setShowSettings(false);
    toast('开始全盘静默扫描，请稍候...');

    let totalFound = 0;
    const startTime = Date.now();

    // 递归扫描函数
    const scanRecursively = async (currentPath: string) => {
      if (cancelScanRef.current) return;

      // 安全检查：跳过系统目录和忽略目录
      if (IGNORE_DIRS.some(ignored => currentPath.includes(ignored))) return;

      try {
        // 获取文件列表
        const filesStr = native.file?.list?.(currentPath);
        const items = parseNativeList(filesStr);
        if (!items.length) return;

        for (const item of items) {
          if (cancelScanRef.current) return;
          const fullPath = `${currentPath}/${item}`;
          const lowerItem = item.toLowerCase();

          // 检查是否为支持的媒体文件
          const isAudio = AUDIO_FORMATS.some(ext => lowerItem.endsWith(ext));
          const isVideo = VIDEO_FORMATS.some(ext => lowerItem.endsWith(ext));

          if (isAudio || isVideo) {
            // --- 增加文件大小/时长过滤 ---
            try {
              const size = native.file?.size?.(fullPath);
              if (typeof size === 'number') {
                if (isAudio && size < MIN_AUDIO_SIZE) continue;
                if (isVideo && size < MIN_VIDEO_SIZE) continue;
              }
            } catch { }

            try {
              const songInfo = await parseMusicFile(fullPath, item, detectSourceFromPath(fullPath));
              await dbSaveLocalSong(songInfo);
              totalFound++;
            } catch { }
          } else if (!item.includes('.')) {
            // 粗略判断：没有扩展名可能是文件夹 (native list 无法区分)
            // 进一步：尝试递归。为了不阻塞，每隔几个文件夹暂停一下
            await new Promise(r => setTimeout(r, 0)); // 释放主线程
            await scanRecursively(fullPath);
          }
        }
      } catch (e) {
        // 忽略无权限访问的目录错误
      }
    };

    try {
      // 从根目录开始扫描
      await scanRecursively('/storage/emulated/0');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      toast(`全盘扫描完成，耗时 ${duration}秒，共找到 ${totalFound} 个文件`);
      loadSongsFromDB(); // 刷新显示
    } catch (e) {
      console.error("Full scan error", e);
    } finally {
      setIsSilentScanning(false);
    }
  };

  const scanDirectory = async (dirPath: string, sourceName: string): Promise<number> => {
    const native = nativeRef.current;
    const filesStr = native?.file?.list?.(dirPath);
    const fileList = parseNativeList(filesStr);
    if (!fileList.length) return 0;

    let count = 0;

    for (const fileName of fileList) {
      if (cancelScanRef.current) break;
      const lowerName = fileName.toLowerCase();

      const isAudio = AUDIO_FORMATS.some(ext => lowerName.endsWith(ext));
      const isVideo = VIDEO_FORMATS.some(ext => lowerName.endsWith(ext));

      if (isAudio || isVideo) {
        const filePath = `${dirPath}/${fileName}`;
        // --- 增加文件大小/时长过滤 ---
        try {
          const size = native.file?.size?.(filePath);
          if (typeof size === 'number') {
            if (isAudio && size < MIN_AUDIO_SIZE) continue;
            if (isVideo && size < MIN_VIDEO_SIZE) continue;
          }
        } catch { }

        try {
          const songInfo = await parseMusicFile(filePath, fileName, sourceName);
          await dbSaveLocalSong(songInfo);
          count++;
        } catch (e) { }
      }
    }
    return count;
  };
  // --- 新增：核心匹配逻辑 ---
  const handleMatchMeta = async () => {
    if (isScanning || isMatching) return;

    const native = nativeRef.current;
    if (!native) return;

    setIsMatching(true);
    cancelScanRef.current = false;
    setShowSettings(false); // 关闭弹窗
    toast('开始匹配歌词与封面...');

    let updatedCount = 0;
    const allSongs = [...localSongs]; // 获取当前列表快照
    const total = allSongs.length;

    for (let i = 0; i < total; i++) {
      if (cancelScanRef.current) break;
      const song = allSongs[i];
      setScanStatus(`匹配中: ${song.title}`);
      setScanProgress((i / total) * 100);

      // 如果已经有本地歌词和封面，跳过
      const hasLocalLrc = song.lyrics && !song.lyrics.startsWith('['); // 简单判断，实际建议检查文件是否存在
      const hasLocalCover = song.coverUrl && song.coverUrl.startsWith('file://');

      if (hasLocalLrc && hasLocalCover) continue;

      try {
        // 1. 联网搜索匹配
        // 注意：这里使用 searchMusic + fetchSongDetail 组合
        // 为了准确率，可以先用 song.title + song.artist 搜，取第一个
        const keywords = `${song.title} ${song.artist}`.trim();
        const searchResults = await searchMusic(keywords);

        if (searchResults && searchResults.length > 0) {
          const bestMatch = searchResults[0];
          const detail = await fetchSongDetail(bestMatch);

          let newItem = { ...song };
          let isUpdated = false;

          // 2. 保存歌词
          if (detail.lyrics && (!song.lyrics || song.lyrics.length < 10)) {
            const lrcName = `${song.title}-${song.artist}.lrc`;
            const lrcPath = saveTextFile(lrcName, detail.lyrics, 'lrcs');
            if (lrcPath) {
              newItem.lyrics = `file://${lrcPath}`; // 存入数据库的是文件路径
              isUpdated = true;
            }
          }

          // 3. 保存封面
          if (detail.coverUrl && (!song.coverUrl || song.coverUrl.includes('unsplash'))) {
            // 下载封面图片并保存
            try {
              // 需要一个将网络图片转Base64的辅助函数，或者 fetch blob
              const resp = await fetch(detail.coverUrl);
              const blob = await resp.blob();
              const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              const picName = `${song.title}-${song.artist}.jpg`;
              const picPath = saveDownloadedMedia(picName, base64, 'picture');

              if (picPath) {
                newItem.coverUrl = `file://${picPath}`;
                isUpdated = true;
              }
            } catch (e) {
              console.warn('Cover download failed', e);
            }
          }

          // 4. 更新数据库
          if (isUpdated) {
            await dbSaveLocalSong(newItem);
            updatedCount++;
          }
        }
      } catch (e) {
        console.warn(`Match failed for ${song.title}`, e);
      }

      // 避免请求过快
      await new Promise(r => setTimeout(r, 500));
    }

    setIsMatching(false);
    setScanStatus(cancelScanRef.current ? '匹配已取消' : '匹配完成');
    toast(`匹配完成，更新了 ${updatedCount} 首歌曲信息`);
    loadSongsFromDB(); // 刷新列表
  };
  const dataToBlob = (data: string): Blob => {
    let bytes: Uint8Array;
    if (data.startsWith('data:')) {
      const base64 = data.split(',')[1];
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      const binary = atob(data);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'audio/mpeg' });
  };

  const parseMusicFile = async (filepath: string, filename: string, source: string): Promise<Song & { addDate: number }> => {
    let blob: Blob | null = null;
    try {
      // 仅对音频文件尝试读取标签，视频跳过
      if (AUDIO_FORMATS.some(ext => filename.toLowerCase().endsWith(ext))) {
        // 限制读取大小，防止 OOM
        // const chunk = nativeRef.current?.file?.readPart?(filepath, 0, 1024*1024); // 理想情况
        const chunk = nativeRef.current?.file?.read?.(filepath);
        if (chunk) blob = dataToBlob(chunk);
      }
    } catch (e) { }

    if (blob && typeof jsmediatags !== 'undefined') {
      try {
        return await new Promise((resolve) => {
          new jsmediatags.Reader(blob)
            .setTagsToRead(["title", "artist", "album", "picture"])
            .read({
              onSuccess: (tag: any) => {
                const { title, artist, album, picture } = tag.tags;
                resolve(createSongObject(filepath, filename, source, title, artist, album, picture));
              },
              onError: () => resolve(createSongObject(filepath, filename, source))
            });
        });
      } catch (e) {
        return createSongObject(filepath, filename, source);
      }
    }
    return createSongObject(filepath, filename, source);
  };

  const createSongObject = (path: string, filename: string, source: string, title?: string, artist?: string, album?: string, picture?: any): Song & { addDate: number } => {
    let finalTitle = title;
    let finalArtist = artist;

    if (!finalTitle || !finalArtist) {
      const nameNoExt = filename.replace(/\.[^/.]+$/, '');
      const separators = [' - ', '-', '—', '–', '_'];
      let parts = [nameNoExt];

      for (const sep of separators) {
        if (nameNoExt.includes(sep)) {
          parts = nameNoExt.split(sep);
          break;
        }
      }

      if (parts.length >= 2) {
        finalArtist = finalArtist || parts[0].trim();
        finalTitle = finalTitle || parts.slice(1).join('-').trim();
      } else {
        finalTitle = finalTitle || nameNoExt;
        finalArtist = finalArtist || '未知歌手';
      }
    }

    let coverUrl = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80';
    if (picture) {
      const { data, format } = picture;
      let base64String = '';
      for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
      coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
    }

    return {
      id: `loc_${path}`,
      title: fixEncoding(finalTitle || '未知歌曲'),
      artist: fixEncoding(finalArtist || '未知歌手'),
      album: fixEncoding(album || source),
      coverUrl: coverUrl,
      duration: 0,
      url: `file://${path}`,
      path: path,
      quality: 'Local',
      source: detectSourceFromPath(path) || source as any,
      isDetailsLoaded: true,
      addDate: Date.now()
    };
  };

  const handlePlayAll = () => {
    const songsToPlay = filteredDisplayItems.filter(item => !('duration' in item && 'size' in item)) as LocalSong[];
    if (songsToPlay.length > 0) {
      const readySongs = songsToPlay.map(s => ({
        ...s,
        url: s.url || (s.path ? `file://${s.path}` : '')
      }));
      onPlayList(readySongs);
    }
  };

  const SettingsPanel = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
      <div className="relative  bg-[#121212] w-[85%] max-w-sm rounded-2xl shadow-2xl border border-white/10 z-[10000] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#121212]/50">
          <div>
            <h3 className="text-white text-lg font-bold">扫描与匹配</h3>
            <p className="text-xs text-slate-400 mt-0.5">管理本地媒体文件</p>
          </div>
          <button onClick={() => setShowSettings(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 常用目录快速扫描 */}
          <button
            onClick={handleFastScan}
            disabled={isSilentScanning}
            className="w-full flex items-center p-4 bg-[#121212] hover:bg-slate-700 rounded-xl transition-colors group text-left border border-white/5 disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mr-4 text-indigo-400 group-hover:scale-110 transition-transform shrink-0">
              <ScanLine size={20} />
            </div>
            <div>
              <h4 className="text-white text-sm font-bold">{isScanning ? "停止扫描" : "快速扫描"}</h4>
              <p className="text-slate-500 text-xs mt-0.5">{isScanning ? "扫描常用目录中..." : "扫描常用音乐与下载目录"}</p>
            </div>
          </button>

          {/* 全盘深度扫描 */}
          <button
            onClick={handleFullSilentScan}
            disabled={isScanning || isSilentScanning}
            className="w-full flex items-center p-4 bg-[#121212] hover:bg-slate-700 rounded-xl transition-colors group text-left border border-white/5 disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mr-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0">
              {isSilentScanning ? <Loader2 size={20} className="animate-spin" /> : <Radar size={20} />}
            </div>
            <div>
              <h4 className="text-white text-sm font-bold">{isSilentScanning ? "扫描中..." : "全盘深度扫描"}</h4>
              <p className="text-slate-500 text-xs mt-0.5">{isSilentScanning ? "后台静默运行中" : "地毯式搜索，不遗漏任何文件"}</p>
            </div>
          </button>

          <button
            onClick={handleMatchMeta}
            disabled={isScanning || isSilentScanning || isMatching}
            className="w-full flex items-center p-4 bg-[#121212] hover:bg-slate-700 rounded-xl transition-colors group text-left border border-white/5 disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center mr-4 text-orange-400 group-hover:scale-110 transition-transform shrink-0">
              {isMatching ? <Loader2 size={20} className="animate-spin" /> : <Fingerprint size={20} />}
            </div>
            <div>
              <h4 className="text-white text-sm font-bold">{isMatching ? "匹配中..." : "词图匹配"}</h4>
              <p className="text-slate-500 text-xs mt-0.5">{isMatching ? `正在处理: ${Math.round(scanProgress)}%` : "联网补全本地音乐的封面与歌词"}</p>
            </div>
          </button>
        </div>

        <div className="p-4 bg-[#121212]/30 border-t border-white/10">
          <button onClick={() => setShowSettings(false)} className="w-full py-3 bg-indigo-600 rounded-xl text-white text-sm font-bold hover:bg-indigo-500 transition-colors active:scale-95 shadow-lg shadow-indigo-900/20">
            完成
          </button>
        </div>
      </div>
    </div>
  );

  const handleSortToggle = () => {
    if (songSort === 'date') {
      setSongSort('name');
    } else if (songSort === 'name') {
      setSongSort('count');
    } else {
      setSongSort('date');
    }
  };

  const getSortLabel = () => {
    switch (songSort) {
      case 'name': return '按名称';
      case 'count': return '按播放';
      default: return '按时间';
    }
  };

  return (
    <div className="h-full  bg-[#121212]  overflow-y-auto no-scrollbar relative pb-32 select-none">
      <div className="sticky top-0 z-30 bg-[#121212]/95 backdrop-blur-md px-6 pt-8 pb-4 border-b border-white/5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white tracking-tight">本地媒体</h1>

          <div className="flex items-center gap-2">
            {/* 匹配中状态提示 */}
            {isMatching && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 animate-pulse">
                <Loader2 size={10} className="text-orange-400 animate-spin" />
                <span className="text-[10px] text-orange-400">词图匹配中 {Math.round(scanProgress)}%</span>
              </div>
            )}
            {isSilentScanning && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-pulse">
                <Loader2 size={10} className="text-emerald-400 animate-spin" />
                <span className="text-[10px] text-emerald-400">深度扫描中</span>
              </div>
            )}
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <MoreVertical size={22} />
            </button>
          </div>
        </div>

        {isScanning && (
          <div className="bg-[#121212]/50 rounded-xl p-3 mb-3 border border-white/5 animate-in slide-in-from-top">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-white/80">{scanStatus}</span>
              <span className="text-xs text-indigo-400">{Math.round(scanProgress)}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${scanProgress}%` }} />
            </div>
          </div>
        )}

        {viewingFolder && activeTab === 'folder' ? (
          <div className="flex items-center gap-3 py-2 animate-in fade-in slide-in-from-right">
            <button onClick={() => setViewingFolder(null)} className="p-2 bg-[#121212] rounded-full hover:bg-slate-700 text-white">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 overflow-hidden">
              <h3 className="text-white font-bold truncate text-sm">{viewingFolder.split('/').pop()}</h3>
              <p className="text-slate-500 text-xs truncate">{viewingFolder}</p>
            </div>
          </div>
        ) : (
          <div className="flex bg-[#121212]/80 rounded-full p-1 w-full">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key as any); setViewingFolder(null); }}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activeTab === tab.key ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {tab.label}
                <span className="ml-1 text-[10px] opacity-75">({tab.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 px-6">
        {((activeTab === 'music' && filteredDisplayItems.length > 0) || (activeTab === 'folder' && viewingFolder && filteredDisplayItems.length > 0)) && (
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors active:scale-95 text-white bg-[#121212] hover:bg-slate-700"
            >
              <Play size={16} className="fill-white" />
              <span className="text-sm font-bold">播放全部</span>
              <span className="text-xs text-slate-500 font-normal">({filteredDisplayItems.length})</span>
            </button>
            <button
              onClick={handleSortToggle}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 px-2 py-1 rounded-md hover:bg-white/5"
            >
              <ArrowUpDown size={14} /> {getSortLabel()}
            </button>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder={viewingFolder
              ? '搜索当前文件夹...'
              : `搜索本地${activeTab === 'mv' ? '视频' : activeTab === 'folder' ? '文件夹' : '音乐'}...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[#121212]/50 text-white text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 transition-all border border-white/5"
            style={{ userSelect: 'text' }}
          />
        </div>

        {(activeTab === 'music' || (activeTab === 'folder' && viewingFolder)) && (
          <div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {loading ? (
              <div className="text-center py-10 text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={24} /><p className="text-xs">加载中...</p></div>
            ) : filteredDisplayItems.length > 0 ? filteredDisplayItems.map((item, idx) => {
              const isMV = 'duration' in item && 'size' in item;
              return (
                <div key={item.id} onClick={() => handleItemClick(item)} className="group flex items-center p-3 rounded-xl hover:bg-white/5 cursor-pointer active:scale-[0.99] transition-all">
                  <span className="text-slate-500 text-sm w-8 font-medium text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0 mr-4 ml-2">
                    <div className="flex items-center mb-1.5">
                      {isMV ? <span className="bg-purple-600 text-[9px] px-1.5 py-0.5 rounded text-white font-medium mr-1.5 align-middle">MV</span> : <SourceBadge source={item.source || 'local'} />}
                      <h3 className="text-white text-sm font-medium truncate">{item.title}</h3>
                      {!isMV && <QualityBadge quality={(item as LocalSong).quality} />}
                    </div>
                    <div className="flex items-center text-xs text-slate-500">
                      <span className="truncate max-w-[150px]">{item.artist}</span>
                    </div>
                  </div>
                  {!isMV && (
                    <button onClick={(e) => { e.stopPropagation(); setActionSong(item as Song); setActionOpen(true); }} className="p-2 text-slate-500 hover:text-white rounded-full hover:bg-white/10">
                      <MoreVertical size={16} />
                    </button>
                  )}
                  {viewingFolder && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteLocal(item); }}
                      className="p-2 text-slate-500 hover:text-red-400 rounded-full hover:bg-white/10 ml-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            }) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Music size={48} className="mb-4 opacity-20" />
                <p className="text-sm">暂无音乐</p>
                {activeTab === 'music' && (
                  <button
                    onClick={handleFastScan}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-full"
                  >
                    {isScanning ? '终止扫描' : '扫描'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mv' && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {displayMvs.length > 0 ? (
              displayMvs.map(mv => (
                <div key={mv.id} onClick={() => handlePlayMV(mv)} className="flex gap-3 p-3 bg-[#121212]/40 rounded-xl border border-white/5 cursor-pointer active:scale-[0.99] hover:bg-[#121212] transition-colors">
                  <div className="w-24 h-16 bg-black/40 rounded-lg flex items-center justify-center text-slate-500 shrink-0 relative overflow-hidden">
                    <Video size={24} />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                      <Play size={20} className="fill-white text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="text-white text-sm font-bold line-clamp-2">{mv.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 truncate">{mv.path}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Smartphone size={48} className="mb-4 opacity-20" />
                <p className="text-sm">暂无本地视频</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'folder' && !viewingFolder && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {displayFolders.length > 0 ? displayFolders.map((folder) => (
              <div key={folder.id} onClick={() => handleFolderClick(folder)} className="flex items-center p-3.5 bg-[#121212]/40 border border-white/5 rounded-2xl cursor-pointer hover:bg-[#121212] transition-colors group active:scale-[0.99]">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mr-4 border border-indigo-500/10">
                  <Folder size={24} className="text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-base font-medium mb-1 truncate">{folder.name}</h3>
                  <div className="flex items-center text-xs text-slate-500">
                    <span className="truncate max-w-[200px] opacity-70">{folder.path}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium px-2 py-1  bg-[#121212] /50 rounded-md">{folder.songCount}首</span>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <FolderOpen size={48} className="mb-4 opacity-20" />
                <p className="text-sm">暂无文件夹</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && <SettingsPanel />}

      <SongActionSheet
        song={actionSong}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onAddToFavorites={songActions.handleAddToFavorites}
        onAddToQueue={songActions.handleAddToQueue}
        onAddToNext={onAddToNext ? songActions.handleAddToNext : undefined}
        onAddToPlaylist={songActions.handleAddToPlaylist}
        onCreatePlaylistAndAdd={songActions.handleCreatePlaylistAndAdd}
        onDownloadMusic={(s) => songActions.handleDownload(s, 'music')}
        onDownloadMv={(s) => songActions.handleDownload(s, 'video')}
      />
    </div>
  );
};

export default Local;