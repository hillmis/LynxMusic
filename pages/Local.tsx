import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MoreVertical, Play, Search,
  ArrowUpDown, ScanLine, Image, Trash2, HardDrive,
  Folder, ChevronRight, FolderOpen, RefreshCw,
  Smartphone, Loader2, Music, ListMusic, X, ArrowLeft, Video
} from 'lucide-react';
import { Song } from '../types';
import { dbGetLocalSongs, dbSaveLocalSong, dbClearLocalSongs } from '../utils/db';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useSongActions } from '../hooks/useSongActions';
import SongActionSheet from '../components/SongActionSheet';

// --- 类型声明 ---
type SourceType = 'download' | 'qq' | 'wy' | 'kw' | 'kg' | 'Hill' | 'local' | string;
type QualityType = 'SQ' | 'HQ' | 'STD' | 'Local';

// 声明外部注入对象 webapp
declare const webapp: {
  bestow: () => boolean;
  rights: () => void;
  toast: (msg: string) => void;
  listfile: (path: string) => string;
  gainsize: (path: string) => number;
  gainfile: (path: string, offset?: number, length?: number) => string;
  makedir: (path: string) => void;
  savefile: (path: string, content: string) => boolean;
} | undefined;

declare const jsmediatags: any;

interface LocalSong extends Song {
  addDate: number; // 修改为时间戳以便排序
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

// --- 配置常量 ---
const AUDIO_FORMATS = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.amr'];
const VIDEO_FORMATS = ['.mp4', '.mkv', '.avi', '.3gp', '.webm', '.mov'];

const MUSIC_APP_PATHS: Record<string, string> = {
  'HillMusic': '/storage/emulated/0/HillMusic/song',
  '网易云音乐': '/storage/emulated/0/netease/cloudmusic/Music/',
  '酷狗音乐': '/storage/emulated/0/kgmusic/download/',
  '酷我音乐': '/storage/emulated/0/KwDownload/download/',
  'QQ音乐': '/storage/emulated/0/qqmusic/song',
  '咪咕音乐': '/storage/emulated/0/migu/mp3/',
  'Download': '/storage/emulated/0/Download/',
  '音乐': '/storage/emulated/0/Music/',
  '视频': '/storage/emulated/0/Movies/'
};

// --- 辅助组件 ---
const SourceBadge: React.FC<{ source: SourceType }> = ({ source }) => {
  let color = 'bg-slate-600';
  let label = source;

  if (source.includes('QQ')) { color = 'bg-green-600'; label = 'QQ音乐'; }
  else if (source.includes('网易')) { color = 'bg-red-600'; label = '网易云'; }
  else if (source.includes('酷我')) { color = 'bg-yellow-600'; label = '酷我'; }
  else if (source.includes('酷狗')) { color = 'bg-blue-600'; label = '酷狗'; }
  else if (source.includes('Hill')) { color = 'bg-indigo-600'; label = 'Hill'; }
  else if (source.includes('Download')) { color = 'bg-purple-600'; label = '下载'; }
  else { label = '本地'; }

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

const MenuItem: React.FC<{ icon: any; label: string; sub: string; onClick?: () => void }> = ({
  icon: Icon,
  label,
  sub,
  onClick
}) => (
  <div
    onClick={onClick}
    className="flex items-center p-4 hover:bg-white/5 rounded-xl cursor-pointer active:bg-white/10 transition-colors group"
  >
    <div className="w-10 h-10 rounded-full bg-[#0f172a] flex items-center justify-center mr-4 text-indigo-400 group-hover:scale-110 transition-transform">
      <Icon size={20} />
    </div>
    <div className="flex-1">
      <h4 className="text-white text-sm font-medium">{label}</h4>
      <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
    </div>
  </div>
);

// --- 主组件 ---
const Local: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'music' | 'mv' | 'folder'>('music');
  const [showSettings, setShowSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingFolder, setViewingFolder] = useState<string | null>(null);

  const [localSongs, setLocalSongs] = useState<LocalSong[]>([]);
  const [localMvs, setLocalMvs] = useState<LocalMV[]>([]);
  const [localFolders, setLocalFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const [songSort, setSongSort] = useState<'name' | 'date' | 'count'>('date');

  const cancelScanRef = useRef(false);
  const [scanStats, setScanStats] = useState<ScanStats>({
    total: 0,
    scanned: 0,
    failed: 0,
    currentApp: ''
  });

  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const player = useAudioPlayer();
  const songActions = useSongActions({ addToQueue: player.addToQueue });

  useEffect(() => {
    loadSongsFromDB();
  }, []);

  const loadSongsFromDB = async () => {
    setLoading(true);
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
          });
        } else {
          // ✅ 修复：优先使用 DB 中存储的 addDate，如果没有则使用当前时间补齐
          const storedDate = item.addDate || item.createdAt;
          // 兼容旧数据可能存储的是字符串日期，尝试转时间戳
          const dateVal = typeof storedDate === 'number' ? storedDate : (storedDate ? new Date(storedDate).getTime() : Date.now());

          songs.push({
            ...item,
            addDate: dateVal,
            playCount: item.playCount || 0,
            source: (item.source as SourceType) || 'local',
            quality: 'Local' as QualityType
          });
        }

        if (item.path) {
          const lastSlash = item.path.lastIndexOf('/');
          const folderPath = lastSlash > -1 ? item.path.substring(0, lastSlash) : 'root';
          const folderName = folderPath.split('/').pop() || 'unknown';

          if (!folderMap.has(folderPath)) {
            let srcIcon = 'local';
            for (const [key, val] of Object.entries(MUSIC_APP_PATHS)) {
              if (folderPath.includes(val.replace(/\/$/, ''))) {
                srcIcon = key;
                break;
              }
            }
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
      setLoading(false);
    }
  };

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

  // ✅ 修复：排序逻辑
  const sortedSongs = useMemo(() => {
    return [...localSongs].sort((a, b) => {
      if (songSort === 'name') {
        return a.title.localeCompare(b.title, 'zh-CN');
      }
      if (songSort === 'count') {
        return b.playCount - a.playCount;
      }
      // Date sort (descending: newest first)
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
    return displayItems.filter(item => item.title.toLowerCase().includes(lower) || item.artist.toLowerCase().includes(lower));
  }, [displayItems, searchTerm]);

  const displayMvs = useMemo(() => {
    if (!searchTerm) return localMvs;
    const lower = searchTerm.toLowerCase();
    return localMvs.filter(m => m.title.toLowerCase().includes(lower));
  }, [localMvs, searchTerm]);

  const displayFolders = useMemo(() => {
    if (!searchTerm) return localFolders;
    const lower = searchTerm.toLowerCase();
    return localFolders.filter(f => f.name.toLowerCase().includes(lower));
  }, [localFolders, searchTerm]);

  const handlePlaySong = (song: LocalSong) => {
    const playObj = {
      ...song,
      url: `file://${song.path}`
    };
    player.playSong(playObj);
  };

  const handlePlayMV = (mv: LocalMV | any) => {
    const videoSong: Song = {
      id: mv.id,
      title: mv.title,
      artist: mv.artist || '未知艺术家',
      coverUrl: mv.coverUrl || '',
      url: `file://${mv.path}`,
      mvUrl: `file://${mv.path}`,
      path: mv.path,
      source: 'local',
      isDetailsLoaded: true
    };
    player.playSong(videoSong);
    window.webapp?.toast?.('正在打开视频...');
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
  };

  const handleScanToggle = async () => {
    if (isScanning) {
      cancelScanRef.current = true;
      setIsScanning(false);
      setScanStatus('已停止扫描');
      setShowSettings(false);
      return;
    }

    if (typeof webapp === 'undefined') {
      alert('需在 App 环境中运行');
      return;
    }

    try {
      if (!webapp.bestow()) {
        webapp.rights();
        webapp.toast('请授予存储权限');
        return;
      }
    } catch (e) {
      console.warn('权限检查忽略', e);
    }

    setIsScanning(true);
    cancelScanRef.current = false;
    setScanProgress(0);
    setScanStatus('准备开始扫描...');
    setScanStats({ total: 0, scanned: 0, failed: 0, currentApp: '' });
    setShowSettings(false);

    await dbClearLocalSongs();
    setLocalSongs([]);
    setLocalMvs([]);
    setLocalFolders([]);

    try {
      const apps = Object.entries(MUSIC_APP_PATHS);
      let totalFound = 0;

      for (let i = 0; i < apps.length; i++) {
        if (cancelScanRef.current) break;

        const [appName, dirPath] = apps[i];
        setScanStatus(`扫描: ${appName}`);
        setScanStats(prev => ({ ...prev, currentApp: appName }));
        setScanProgress(((i) / apps.length) * 100);

        try {
          const cleanPath = dirPath.replace(/\/$/, '');
          if (webapp.listfile(cleanPath) !== "null") {
            const found = await scanDirectory(cleanPath, appName);
            totalFound += found;
            setScanStats(prev => ({ ...prev, total: prev.total + found, scanned: prev.scanned + found }));
          }
        } catch (err) { }
      }

      setScanStatus(cancelScanRef.current ? '扫描已取消' : `扫描完成，共 ${totalFound} 个文件`);
      setScanProgress(100);
      webapp?.toast(`扫描完成，找到 ${totalFound} 个媒体文件`);
      loadSongsFromDB();

    } catch (error: any) {
      setScanStatus(`出错: ${error.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const scanDirectory = async (dirPath: string, sourceName: string): Promise<number> => {
    const filesStr = webapp!.listfile(dirPath);
    if (!filesStr || filesStr === "null") return 0;

    const fileList = filesStr.split(/[\\/]/)
      .map(f => f.trim())
      .filter(f => f && f !== '.' && f !== '..')
      .map(f => f.split(/[\\/]/).pop() || '');

    let count = 0;

    for (const fileName of fileList) {
      if (cancelScanRef.current) break;
      const lowerName = fileName.toLowerCase();

      const isAudio = AUDIO_FORMATS.some(ext => lowerName.endsWith(ext));
      const isVideo = VIDEO_FORMATS.some(ext => lowerName.endsWith(ext));

      if (isAudio || isVideo) {
        const filePath = `${dirPath}/${fileName}`;
        try {
          const songInfo = await parseMusicFile(filePath, fileName, sourceName);
          await dbSaveLocalSong(songInfo);
          count++;
        } catch (e) { }
      }
    }
    return count;
  };

  const isMusicFile = (filename: string): boolean => {
    const ext = filename.toLowerCase();
    return SUPPORTED_FORMATS.some(format => ext.endsWith(format));
  };

  const dataToBlob = (data: string): Blob => {
    let bytes: Uint8Array;
    if (data.startsWith('data:')) {
      const base64 = data.split(',')[1];
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'audio/mpeg' });
  };

  const parseMusicFile = async (filepath: string, filename: string, source: string): Promise<Song> => {
    let blob: Blob | null = null;
    try {
      const chunk = webapp?.gainfile(filepath, 0, 3 * 1024 * 1024);
      if (chunk) blob = dataToBlob(chunk);
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
      const separators = [' - ', '-', '－', '—', '_'];
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
      source: source as any,
      isDetailsLoaded: true,
      // ✅ 修复：扫描时记录时间戳
      addDate: Date.now()
    };
  };

  const fixEncoding = (text: string): string => {
    if (!text) return text;
    try {
      if (/[\u4e00-\u9fa5]/.test(text)) return text;
      const decoded = decodeURIComponent(escape(text));
      return decoded;
    } catch { return text; }
  };

  const handlePlayAll = () => {
    const songsToPlay = filteredDisplayItems.filter(item => !('duration' in item && 'size' in item)) as LocalSong[];
    if (songsToPlay.length > 0) {
      const readySongs = songsToPlay.map(s => ({ ...s, url: `file://${s.path}` }));
      player.playList(readySongs);
    }
  };

  // ✅ 修复：修改为居中弹窗样式
  const SettingsPanel = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />

      {/* 居中弹窗卡片 */}
      <div className="relative  bg-slate-900 w-[85%] max-w-sm rounded-2xl shadow-2xl border border-white/10 z-[10000] overflow-hidden animate-in zoom-in-95 duration-200">

        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#0f172a]/50">
          <div>
            <h3 className="text-white text-lg font-bold">扫描与匹配</h3>
            <p className="text-xs text-slate-400 mt-0.5">管理本地媒体文件</p>
          </div>
          <button onClick={() => setShowSettings(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-3">
          <button
            onClick={handleScanToggle}
            className="w-full flex items-center p-4 bg-[#0f172a] hover:bg-slate-700 rounded-xl transition-colors group text-left border border-white/5"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mr-4 text-indigo-400 group-hover:scale-110 transition-transform shrink-0">
              <ScanLine size={20} />
            </div>
            <div>
              <h4 className="text-white text-sm font-bold">{isScanning ? "停止扫描" : "扫描本地媒体"}</h4>
              <p className="text-slate-500 text-xs mt-0.5">{isScanning ? "正在扫描中..." : "更新本地歌曲与视频库"}</p>
            </div>
          </button>

          <button
            className="w-full flex items-center p-4 bg-[#0f172a] hover:bg-slate-700 rounded-xl transition-colors group text-left border border-white/5"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center mr-4 text-orange-400 group-hover:scale-110 transition-transform shrink-0">
              <Image size={20} />
            </div>
            <div>
              <h4 className="text-white text-sm font-bold">词图匹配</h4>
              <p className="text-slate-500 text-xs mt-0.5">自动补全封面与歌词 (开发中)</p>
            </div>
          </button>
        </div>

        {/* 底部 */}
        <div className="p-4 bg-[#0f172a]/30 border-t border-white/10">
          <button onClick={() => setShowSettings(false)} className="w-full py-3 bg-indigo-600 rounded-xl text-white text-sm font-bold hover:bg-indigo-500 transition-colors active:scale-95 shadow-lg shadow-indigo-900/20">
            完成
          </button>
        </div>
      </div>
    </div>
  );

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500 px-6">
      <Music size={48} className="mb-4 opacity-20" />
      <p className="text-sm">暂无数据</p>
      {activeTab === 'music' && (
        <button
          onClick={handleScanToggle}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-500 transition-colors flex items-center gap-2"
        >
          <RefreshCw size={14} />
          扫描本地音乐
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full  bg-slate-900  overflow-y-auto no-scrollbar relative pb-32">
      <div className="sticky top-0 z-30 bg-[#0f172a]/95 backdrop-blur-md px-6 pt-8 pb-4 border-b border-white/5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white tracking-tight">本地媒体</h1>
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
            <MoreVertical size={22} />
          </button>
        </div>

        {isScanning && (
          <div className="bg-[#0f172a]/50 rounded-xl p-3 mb-3 border border-white/5 animate-in slide-in-from-top">
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
            <button onClick={() => setViewingFolder(null)} className="p-2 bg-[#0f172a] rounded-full hover:bg-slate-700 text-white">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 overflow-hidden">
              <h3 className="text-white font-bold truncate text-sm">{viewingFolder.split('/').pop()}</h3>
              <p className="text-slate-500 text-xs truncate">{viewingFolder}</p>
            </div>
          </div>
        ) : (
          <div className="flex bg-[#0f172a]/80 rounded-full p-1 w-full">
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
              className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors active:scale-95 text-white bg-[#0f172a] hover:bg-slate-700"
            >
              <Play size={16} className="fill-white" />
              <span className="text-sm font-bold">播放全部</span>
              <span className="text-xs text-slate-500 font-normal">({filteredDisplayItems.length})</span>
            </button>
            {/* ✅ 排序按钮功能修复 */}
            <button onClick={() => setSongSort(s => s === 'date' ? 'name' : 'date')} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 px-2 py-1 rounded-md hover:bg-white/5">
              <ArrowUpDown size={14} /> {songSort === 'name' ? '按名称' : '按时间'}
            </button>
          </div>
        )}

        {!viewingFolder && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder={`搜索本地${activeTab === 'mv' ? '视频' : activeTab === 'folder' ? '文件夹' : '音乐'}...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#0f172a]/50 text-white text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 transition-all border border-white/5"
            />
          </div>
        )}

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
                </div>
              );
            }) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Music size={48} className="mb-4 opacity-20" />
                <p className="text-sm">暂无音乐</p>
                {activeTab === 'music' && <button onClick={handleScanToggle} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-full">扫描</button>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mv' && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {displayMvs.length > 0 ? (
              displayMvs.map(mv => (
                <div key={mv.id} onClick={() => handlePlayMV(mv)} className="flex gap-3 p-3 bg-[#0f172a]/40 rounded-xl border border-white/5 cursor-pointer active:scale-[0.99] hover:bg-[#0f172a] transition-colors">
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
              <div key={folder.id} onClick={() => handleFolderClick(folder)} className="flex items-center p-3.5 bg-[#0f172a]/40 border border-white/5 rounded-2xl cursor-pointer hover:bg-[#0f172a] transition-colors group active:scale-[0.99]">
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
                  <span className="text-xs text-slate-400 font-medium px-2 py-1  bg-slate-900 /50 rounded-md">{folder.songCount}首</span>
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
        onAddToPlaylist={songActions.handleAddToPlaylist}
        onCreatePlaylistAndAdd={songActions.handleCreatePlaylistAndAdd}
        onDownloadMusic={(s) => songActions.handleDownload(s, 'music')}
        onDownloadMv={(s) => songActions.handleDownload(s, 'video')}
      />
    </div>
  );
};

export default Local;