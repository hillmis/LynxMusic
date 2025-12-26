import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Settings, Heart, Clock, Plus,
  BarChart3, User, ChevronRight,
  Download, LogIn, UserCog, ChevronDown, ChevronUp, Import, Loader2,
  Gift, RefreshCw, Camera, Image as ImageIcon // 增加 Image 图标并重命名为 ImageIcon 以免冲突
} from 'lucide-react';
import { Playlist } from '../types';
import {
  getUserPlaylists, createUserPlaylist, saveImportedPlaylist, upsertFavoriteFromImport, FAVORITE_PLAYLIST_TITLE, FAVORITE_COVER_URL
} from '../utils/playlistStore';
import { getListenRecords, ListenRecord, getTotalListenSeconds } from '../utils/db';
import { formatDuration } from '../utils/time';
import { getOnlinePlaylistConfigList, readOnlinePlaylistFavorites, writeOnlinePlaylistFavorites, ONLINE_PLAYLIST_FAVORITES_EVENT } from '../utils/onlinePlaylistFavorites';
import { fetchQQPlaylist, fetchKuwoPlaylist, fetchWangyiPlaylist, fetchKugouPlaylist } from '../utils/api';
import { safeToast } from '../utils/fileSystem';

const toast = safeToast;
const PREVIEW_COVER_CACHE_KEY = 'hm_preview_covers_v1';
const USER_PROFILE_KEY = 'hm_user_profile_v1'; // ? 新增存储Key

const readPreviewCovers = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(PREVIEW_COVER_CACHE_KEY);
    if (!raw) return {};
    const cache = JSON.parse(raw) as Record<string, { covers?: string[] }>;
    const result: Record<string, string[]> = {};
    Object.keys(cache).forEach((key) => {
      const covers = cache[key]?.covers;
      if (Array.isArray(covers) && covers.length > 0) {
        result[key] = covers;
      }
    });
    return result;
  } catch {
    return {};
  }
};

/* ================= Props ================= */

interface MineProps {
  onNavigatePlaylist: (playlist: Playlist) => void;
  onNavigateSettings: () => void;
  onNavigateRecent?: () => void;
  onNavigateChart?: () => void;
  onNavigateLocal?: () => void;
  onNavigateCheckIn?: () => void;
  onNavigateDownloads?: () => void;
}

interface UserProfile {
  nickname: string;
  avatar: string;
}

/* ================= 页面 ================= */

const Mine: React.FC<MineProps> = ({
  onNavigatePlaylist,
  onNavigateSettings,
  onNavigateRecent,
  onNavigateChart,
  onNavigateLocal,
  onNavigateCheckIn,
  onNavigateDownloads
}) => {
  /* ---------- 状态 ---------- */
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [records, setRecords] = useState<ListenRecord[]>([]);
  const [totalListenSeconds, setTotalListenSeconds] = useState(0);
  const getDayKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayKey = useMemo(() => getDayKey(Date.now()), []);
  const monthStartMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 29);
    return d.getTime();
  }, []);
  const [favoriteOnlineIds, setFavoriteOnlineIds] = useState<Set<string>>(new Set());
  const [favoriteOnlineCovers, setFavoriteOnlineCovers] = useState<Record<string, string[]>>({});
  const [openingOnlineId, setOpeningOnlineId] = useState<string | null>(null);
  const onlineConfigs = useMemo(() => getOnlinePlaylistConfigList(), []);
  const favoriteOnlineList = useMemo(
    () => onlineConfigs.filter((cfg) => favoriteOnlineIds.has(cfg.id)),
    [onlineConfigs, favoriteOnlineIds]
  );
  const [isFavoriteOnlineExpanded, setIsFavoriteOnlineExpanded] = useState(true);

  // Stats Collapse State
  const [isStatsExpanded, setIsStatsExpanded] = useState(true);

  // User State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // ? 新增：用户资料状态
  const [userProfile, setUserProfile] = useState<UserProfile>({
    nickname: '游客',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
  });
  // 2. 定义文件输入的 Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. 新增：处理本地文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 简单校验文件类型
    if (!file.type.startsWith('image/')) {
      toast?.('请选择图片文件');
      return;
    }

    // 校验文件大小 (例如限制为 2MB，因为 localStorage 容量有限)
    if (file.size > 10 * 1024 * 1024) {
      toast?.('图片过大，请选择 10MB 以内的图片');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setTempProfile(prev => ({
          ...prev,
          avatar: result // 将 Base64 字符串设置为头像
        }));
      }
    };
    reader.onerror = () => {
      toast?.('读取图片失败');
    };
    reader.readAsDataURL(file); // 读取为 DataURL (Base64)

    // 清空 input，允许重复选择同一张图
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 触发文件选择点击
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };
  // Create Dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  // Import Dialog State
  const [showImport, setShowImport] = useState(false);
  const [importSource, setImportSource] = useState<'qq' | 'wyy' | 'kuwo' | 'kugou'>('qq');
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);

  // ? 新增：编辑资料弹窗状态
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [tempProfile, setTempProfile] = useState<UserProfile>({ nickname: '', avatar: '' });


  /* ================= 初始化 & 加载 ================= */

  useEffect(() => {
    const user = localStorage.getItem('user_token');
    if (user) setIsLoggedIn(true);

    // ? 加载本地存储的个人资料
    const savedProfile = localStorage.getItem(USER_PROFILE_KEY);
    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error('Failed to parse profile', e);
      }
    }
  }, []);

  const loadOnlineFavorites = () => {
    setFavoriteOnlineIds(readOnlinePlaylistFavorites());
    setFavoriteOnlineCovers(readPreviewCovers());
  };

  const load = async () => {
    setPlaylists(await getUserPlaylists());
    const list = await getListenRecords({ includeCleared: true });
    setRecords(list);
    setTotalListenSeconds(getTotalListenSeconds());
    loadOnlineFavorites();
  };

  useEffect(() => {
    load();
    window.addEventListener('playlist-updated', load);
    window.addEventListener('listen-history-updated', load);
    window.addEventListener(ONLINE_PLAYLIST_FAVORITES_EVENT, loadOnlineFavorites);
    return () => {
      window.removeEventListener('playlist-updated', load);
      window.removeEventListener('listen-history-updated', load);
      window.removeEventListener(ONLINE_PLAYLIST_FAVORITES_EVENT, loadOnlineFavorites);
    };
  }, []);

  const favorite = useMemo(() => playlists.find(p => p.title === '我喜欢'), [playlists]);
  const otherPlaylists = useMemo(() => playlists.filter(p => p.title !== '我喜欢'), [playlists]);

  /* ================= 统计逻辑 ================= */
  // ... (保持原样)
  const rangeStats = useMemo(() => {
    let todaySeconds = 0;
    let monthSeconds = 0;
    records.forEach(r => {
      const seconds = Math.max(0, r.playedSeconds || 0);
      const ts = r.ts || 0;
      const key = r.dayKey || getDayKey(ts);
      if (key === todayKey) todaySeconds += seconds;
      if (ts >= monthStartMs) monthSeconds += seconds;
    });
    return { todaySeconds, monthSeconds };
  }, [records, todayKey, monthStartMs]);

  const heatmapData = useMemo(() => {
    const days = 30; // 6 cols * 5 rows = 30 days
    const result = [];
    const now = new Date();

    const recordMap: Record<string, number> = {};
    records.forEach(r => {
      const d = new Date(r.ts);
      const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      recordMap[k] = (recordMap[k] || 0) + r.playedSeconds;
    });

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

      const seconds = recordMap[k] || 0;
      const minutes = Math.floor(seconds / 60);

      let level = 0;
      if (minutes > 60) level = 4;
      else if (minutes > 30) level = 3;
      else if (minutes > 15) level = 2;
      else if (minutes > 0) level = 1;

      result.push({
        date: `${d.getMonth() + 1}-${d.getDate()}`,
        minutes,
        level
      });
    }
    return result;
  }, [records]);

  const totalListenText = useMemo(() => formatDuration(totalListenSeconds), [totalListenSeconds]);
  const todayListenText = useMemo(() => formatDuration(rangeStats.todaySeconds), [rangeStats.todaySeconds]);
  const monthListenText = useMemo(() => formatDuration(rangeStats.monthSeconds), [rangeStats.monthSeconds]);

  /* ================= 行为 ================= */
  const createPlaylist = async () => {
    if (!newName.trim()) return;
    await createUserPlaylist(newName.trim());
    setNewName('');
    setShowCreate(false);
  };

  // 处理歌单导入
  const handleImportPlaylist = async () => {
    const id = importId.trim();
    if (!id) {
      toast?.('请输入歌单ID');
      return;
    }

    setImporting(true);
    let playlist = null;

    try {
      if (importSource === 'qq') {
        playlist = await fetchQQPlaylist(id);
      } else if (importSource === 'kuwo') {
        playlist = await fetchKuwoPlaylist(id);
      } else if (importSource === 'wyy') {
        playlist = await fetchWangyiPlaylist(id);
      } else if (importSource === 'kugou') {
        playlist = await fetchKugouPlaylist(id);
      } else {
        toast?.('该平台暂未支持');
        setImporting(false);
        return;
      }

      if (playlist) {
        if (playlist.title === FAVORITE_PLAYLIST_TITLE) {
          const useFavorite = window.confirm('检测到“我喜欢”歌单。选择“确定”导入到系统“我喜欢”，选择“取消”将创建新的歌单。');
          if (useFavorite) {
            const override = window.confirm('导入到系统“我喜欢”：确定=覆盖现有，取消=合并。');
            await upsertFavoriteFromImport(playlist, override ? 'override' : 'merge');
            toast?.(`已导入到系统“我喜欢” (${override ? '覆盖' : '合并'})`);
          } else {
            playlist = { ...playlist, id: `${playlist.id}_import`, title: `${playlist.title}(导入)` };
            await saveImportedPlaylist(playlist);
            toast?.(`成功导入: ${playlist.title}`);
          }
        } else {
          await saveImportedPlaylist(playlist);
          toast?.(`成功导入: ${playlist.title}`);
        }
        setShowImport(false);
        setImportId('');
      } else {
        toast?.('导入失败，请检查ID是否正确');
      }
    } catch (e) {
      toast?.('网络错误，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const handleOpenFavoriteOnline = async (cfg: { id: string; name: string; key: string; type?: string }) => {
    if (!cfg) return;

    if (cfg.type === 'qq_id') {
      if (openingOnlineId) return;
      setOpeningOnlineId(cfg.id);
      toast?.('正在获取歌单...');
      try {
        const pl = await fetchQQPlaylist(cfg.key);
        if (pl) onNavigatePlaylist(pl);
        else toast?.('获取歌单失败');
      } catch (e) {
        toast?.('网络错误，请稍后重试');
      } finally {
        setOpeningOnlineId(null);
      }
      return;
    }

    const pl: Playlist = {
      id: `dp_${cfg.id}`,
      title: cfg.name,
      creator: 'LynxMusic',
      coverUrl: '',
      songCount: 50,
      description: `精选全网${cfg.name}，实时更新`,
      apiKeyword: cfg.key,
      isLocal: false,
      source: 'qq'
    };
    onNavigatePlaylist(pl);
  };

  const toggleFavoriteOnline = (cfgId: string) => {
    const next = new Set(favoriteOnlineIds);
    if (next.has(cfgId)) {
      next.delete(cfgId);
      toast?.('已取消收藏');
    } else {
      next.add(cfgId);
      toast?.('已收藏歌单');
    }
    setFavoriteOnlineIds(next);
    writeOnlinePlaylistFavorites(next);
  };

  const getFavoriteCovers = (cfgId: string) => {
    return favoriteOnlineCovers[`dp_all_${cfgId}`] || [];
  };

  const handleLogin = () => {
    localStorage.setItem('user_token', 'mock_token');
    setIsLoggedIn(true);
    toast?.('登录成功 (模拟)');
  };

  const handleLogout = () => {
    if (!confirm('确定退出登录吗？')) return;
    localStorage.removeItem('user_token');
    setIsLoggedIn(false);
    toast?.('已退出登录');
  };

  // ? 新增：打开编辑资料
  const openEditProfile = () => {
    setTempProfile({ ...userProfile });
    setShowEditProfile(true);
  };

  // ? 新增：随机生成头像
  const handleRandomAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setTempProfile(prev => ({
      ...prev,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomSeed}`
    }));
  };

  // ? 新增：保存资料
  const handleSaveProfile = () => {
    if (!tempProfile.nickname.trim()) {
      toast?.('昵称不能为空');
      return;
    }
    setUserProfile(tempProfile);
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(tempProfile));
    setShowEditProfile(false);
    toast?.('个人资料已更新');
  };

  const getHeatmapColor = (level: number) => {
    switch (level) {
      case 0: return 'bg-slate-700/50';
      case 1: return 'bg-indigo-400/40';
      case 2: return 'bg-indigo-500/60';
      case 3: return 'bg-indigo-500';
      case 4: return 'bg-indigo-400';
      default: return 'bg-slate-700/50';
    }
  };

  /* ================= UI ================= */

  return (
    <div className="h-full overflow-y-auto bg-[#121212] pb-32 no-scrollbar transition-colors">

      {/* 1. 用户信息区域 */}
      <div className="pt-5 px-6 pb-4 bg-gradient-to-b from-indigo-900/10 to-[#121212]">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            {/* 头像显示 */}
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-indigo-500/30 flex items-center justify-center text-slate-400 overflow-hidden shadow-lg relative group">
              {isLoggedIn ? (
                <img src={userProfile.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={32} />
              )}
            </div>
            <div>
              {/* 昵称显示 */}
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                {isLoggedIn ? userProfile.nickname : '未登录用户'}
              </h1>
              <div className="flex gap-3 mt-2 text-xs text-slate-500">
                <span><b className="text-white">{playlists.length}</b> 歌单</span>
                <span><b className="text-white">{totalListenText}</b> 听歌</span>
              </div>
            </div>
          </div>
          <button onClick={onNavigateSettings} className="p-2 bg-slate-800/50 rounded-full hover:bg-slate-700 text-slate-300 transition-colors">
            <Settings size={20} />
          </button>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          {isLoggedIn ? (
            <>
              {/* ? 修改：点击事件绑定 openEditProfile */}
              <button
                onClick={openEditProfile}
                className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold border border-white/5 active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <UserCog size={14} /> 编辑资料
              </button>
              <button onClick={handleLogout} className="flex-1 bg-slate-800 text-red-400 py-2.5 rounded-xl text-xs font-bold border border-white/5 active:scale-95 transition-transform flex items-center justify-center gap-2">
                <LogOutIcon /> 退出登录
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2">
              <LogIn size={16} /> 立即登录
            </button>
          )}
        </div>
      </div>

      {/* 2. 快捷入口 Grid */}
      <div className="px-6 grid grid-cols-2 gap-3 mb-6">
        <div
          onClick={() => favorite && onNavigatePlaylist(favorite)}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
            <Heart size={20} className="fill-current" />
          </div>
          <div>
            <div className="text-white font-bold text-sm">我喜欢</div>
            <div className="text-xs text-slate-500">{favorite?.songCount || 0} 首</div>
          </div>
        </div>

        <div
          onClick={() => onNavigateRecent?.()}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">最近播放</div>
            <div className="text-xs text-slate-500">听歌记录</div>
          </div>
        </div>

        <div
          onClick={() => {
            if (onNavigateDownloads) onNavigateDownloads();
            else if (onNavigateLocal) onNavigateLocal();
            else toast?.('本地音乐管理请前往\"本地\"页面');
          }}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Download size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">下载管理</div>
            <div className="text-xs text-slate-500">下载任务</div>
          </div>
        </div>

        <div
          onClick={() => {
            if (onNavigateCheckIn) onNavigateCheckIn();
            else toast?.('请前往签到/福利页面查看');
          }}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
            <Gift size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">福利中心</div>
            <div className="text-xs text-slate-500">权益活动</div>
          </div>
        </div>
      </div>

      {/* 3. 听歌统计 */}
      <div className="px-6 mb-8">
        <div className="bg-slate-800/30 rounded-3xl border border-white/5 overflow-hidden shadow-sm">
          {/* Header */}
          <div
            className="p-5 flex items-center justify-between cursor-pointer active:bg-white/5"
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-indigo-500" size={18} />
              <span className="text-white font-bold text-sm">听歌统计</span>
            </div>
            {isStatsExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </div>

          {/* Content */}
          {isStatsExpanded && (
            <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-300">

              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">最近30天分布</p>
                </div>
                <button
                  onClick={() => onNavigateChart?.()}
                  className="text-xs text-indigo-500 flex items-center gap-1 hover:text-indigo-400"
                >
                  详细报告 <ChevronRight size={12} />
                </button>
              </div>

              {/* 6*5 热力图 */}
              <div className="grid grid-cols-10 gap-2">
                {heatmapData.map((d, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-md ${getHeatmapColor(d.level)} transition-all hover:scale-110 relative group`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black/80 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {d.date}: {d.minutes}分
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[9px] text-slate-600">少</span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-sm bg-slate-700/50"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-400/40"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-500/60"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-500"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-400"></div>
                </div>
                <span className="text-[9px] text-slate-600">多</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-3">
                  <p className="text-[11px] text-slate-500">今日</p>
                  <p className="text-sm font-bold text-white mt-1">{todayListenText}</p>
                </div>
                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-3">
                  <p className="text-[11px] text-slate-500">近30天</p>
                  <p className="text-sm font-bold text-white mt-1">{monthListenText}</p>

                </div>
                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-3">
                  <p className="text-[11px] text-slate-500">总累计</p>
                  <p className="text-sm font-bold text-white mt-1">{totalListenText}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. 收藏歌单 */}
      <div className="px-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            收藏歌单
            <span className="text-xs text-slate-500 font-normal">({favoriteOnlineList.length})</span>
          </h2>
          <button
            onClick={() => setIsFavoriteOnlineExpanded(!isFavoriteOnlineExpanded)}
            className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 active:scale-90 transition-transform"
            aria-label="toggle-favorite-playlists"
          >
            {isFavoriteOnlineExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {isFavoriteOnlineExpanded && (favoriteOnlineList.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-700 rounded-2xl bg-slate-800/20">
            <p className="text-slate-500 text-xs">暂无收藏歌单</p>
            <p className="text-slate-600 text-[10px] mt-1">去歌单广场收藏你喜欢的在线歌单</p>
          </div>
        ) : (
          <div className="space-y-2">
            {favoriteOnlineList.map(cfg => {
              const covers = getFavoriteCovers(cfg.id);
              const cover = covers[0];
              const isLoading = openingOnlineId === cfg.id;
              return (
                <div
                  key={cfg.id}
                  className="flex items-center p-3 rounded-2xl hover:bg-slate-800/60 transition-colors relative group border border-transparent hover:border-white/5 active:scale-[0.99]"
                  onClick={() => handleOpenFavoriteOnline(cfg)}
                >
                  <div className="w-14 h-14 rounded-xl mr-3 bg-slate-800 shadow-md overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                    {cover ? (
                      <img src={cover} className="w-full h-full object-cover" alt={cfg.name} />
                    ) : (
                      <Heart size={20} className="text-rose-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm font-bold truncate">{cfg.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{cfg.type === 'qq_id' ? 'QQ官方歌单' : '在线精选歌单'}</div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavoriteOnline(cfg.id); }}
                    className="p-2 rounded-full bg-slate-800/70 text-rose-400 hover:bg-slate-700/80 active:scale-90 transition-transform"
                    aria-label="toggle-favorite"
                  >
                    <Heart size={16} className="fill-current" />
                  </button>
                  {isLoading && <Loader2 size={16} className="ml-2 text-indigo-400 animate-spin" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 5. 我的歌单 */}
      <div className="px-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            我的歌单
            <span className="text-xs text-slate-500 font-normal">({playlists.length})</span>
          </h2>
          <div className="flex gap-2">
            {/* 导入按钮 */}
            <button
              onClick={() => { setShowImport(true); setImportId(''); }}
              className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 active:scale-90 transition-transform"
            >
              <Import size={18} />
            </button>
            {/* 新建按钮 */}
            <button
              onClick={() => setShowCreate(true)}
              className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 active:scale-90 transition-transform"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {/* 先显示"我喜欢"歌单 */}
          {favorite && (
            <div
              key={favorite.id}
              className="flex items-center p-3 rounded-2xl hover:bg-slate-800/60 transition-colors relative group border border-transparent hover:border-white/5 active:scale-[0.99]"
              onClick={() => onNavigatePlaylist(favorite)}
            >
              <div className="w-14 h-14 rounded-xl mr-3 bg-gradient-to-br from-red-500/20 to-red-600/10 shadow-md overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                <Heart size={24} className="text-red-500 fill-current" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-slate-200 text-sm font-bold truncate flex items-center gap-1 text-slate-900">
                  <span className="text-slate-200">我喜欢</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{favorite.songCount || 0} 首 · 我的红心歌曲</div>
              </div>
            </div>
          )}

          {/* 再显示其他歌单 */}
          {otherPlaylists.length === 0 && (
            <div className="text-center py-10 border border-dashed border-slate-700 rounded-2xl bg-slate-800/20">
              <p className="text-slate-500 text-xs">暂无自建歌单</p>
              <button onClick={() => setShowCreate(true)} className="mt-2 text-indigo-500 text-xs">立即创建</button>
            </div>
          )}

          {otherPlaylists.map(pl => {
            const isQQ = pl.source === 'qq' || pl.id.startsWith('qq_pl_');
            const isKuwo = pl.source === 'kw' || pl.id.startsWith('kw_pl_');
            const isWyy = pl.source === 'wy' || pl.id.startsWith('wy_pl_');
            const isKugou = pl.source === 'kg' || pl.id.startsWith('kg_pl_');
            const isImported = isQQ || isKuwo || isWyy || isKugou;

            return (
              <div
                key={pl.id}
                className="flex items-center p-3 rounded-2xl hover:bg-slate-800/60 transition-colors relative group border border-transparent hover:border-white/5 active:scale-[0.99]"
                onClick={() => onNavigatePlaylist(pl)}
              >
                <div className="w-14 h-14 rounded-xl mr-3 bg-slate-800 shadow-md overflow-hidden flex-shrink-0 relative">
                  <img src={pl.coverUrl} className="w-full h-full object-cover" alt={pl.title} />
                  {isQQ && <div className="absolute top-0 right-0 bg-green-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">QQ</div>}
                  {isKuwo && <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">KW</div>}
                  {isWyy && <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">WY</div>}
                  {isKugou && <div className="absolute top-0 right-0 bg-sky-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">KG</div>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-slate-200 text-sm font-bold truncate max-w-[80%]">{pl.title}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pl.songCount || 0} 首 · {isImported ? '外部导入' : pl.description || '无简介'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog: Create Playlist */}
      {(showCreate) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-[#121212] w-full max-w-xs rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">新建歌单</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入歌单名称" className="w-full bg-slate-800 text-white p-3 rounded-xl text-sm outline-none border border-transparent focus:border-indigo-500" autoFocus />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800  text-slate-300 font-bold text-sm">取消</button>
              <button onClick={createPlaylist} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* ? Dialog: Edit Profile */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-[#121212] w-full max-w-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-6 text-center">编辑个人资料</h3>

            <div className="flex flex-col items-center gap-4 mb-6">
              {/* 头像预览区 */}
              <div className="relative group">
                <div
                  className="w-24 h-24 rounded-full bg-slate-800 border-2 border-indigo-500/50 overflow-hidden shadow-xl cursor-pointer"
                  onClick={triggerFileSelect} // 点击头像也可以触发选择
                >
                  <img src={tempProfile.avatar} alt="preview" className="w-full h-full object-cover" />
                </div>

                {/* 随机头像按钮 */}
                <button
                  onClick={handleRandomAvatar}
                  className="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full text-white shadow-lg hover:bg-indigo-500 transition-colors z-10"
                  title="随机生成头像"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* 隐藏的文件输入框 */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />

              {/* 头像设置操作区 */}
              <div className="w-full space-y-3">
                {/* 选项 1: 本地相册 */}
                <button
                  onClick={triggerFileSelect}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-2 transition-colors"
                >
                  <ImageIcon size={14} /> 从相册选择图片
                </button>

                {/* 选项 2: 网络链接 */}
                <div>
                  <p className="text-[10px] text-slate-500 mb-1 ml-1">或输入图片链接</p>
                  <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2 border border-white/5">
                    <Camera size={14} className="text-slate-500" />
                    <input
                      value={tempProfile.avatar}
                      onChange={(e) => setTempProfile({ ...tempProfile, avatar: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 bg-transparent text-xs text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 昵称编辑区 */}
            <div className="mb-6">
              <p className="text-[10px] text-slate-500 mb-1 ml-1">昵称</p>
              <input
                value={tempProfile.nickname}
                onChange={(e) => setTempProfile({ ...tempProfile, nickname: e.target.value })}
                placeholder="请输入昵称"
                className="w-full bg-slate-800 text-white p-3 rounded-xl text-sm outline-none border border-transparent focus:border-indigo-500 transition-all"
              />
            </div>

            {/* 按钮区 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowEditProfile(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveProfile}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 shadow-lg shadow-indigo-900/30 transition-all active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Import Playlist */}
      {showImport && (
        <div className="fixed inset-0  backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-[#121212] w-full max-w-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">导入外部歌单</h3>

            {/* Source Select */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setImportSource('qq')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'qq' ? 'bg-green-500 text-white border-green-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                QQ
              </button>
              <button
                onClick={() => setImportSource('kuwo')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'kuwo' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                酷我
              </button>
              <button
                onClick={() => setImportSource('wyy')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'wyy' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                网易云
              </button>
              <button
                onClick={() => setImportSource('kugou')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'kugou' ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                酷狗
              </button>
            </div>

            {/* Input */}
            <div className="mb-2">
              <input
                value={importId}
                onChange={e => setImportId(e.target.value)}
                placeholder={importSource === 'qq' ? "请输入QQ歌单 ID" : (importSource === 'kuwo' ? "请输入酷我歌单 ID" : (importSource === 'wyy' ? "请输入网易云歌单 ID" : "请输入酷狗码/链接"))}
                className={`w-full bg-slate-800  text-white p-3 rounded-xl text-sm outline-none border border-transparent transition-colors ${importSource === 'qq' ? 'focus:border-green-500' : (importSource === 'kuwo' ? 'focus:border-yellow-500' : (importSource === 'wyy' ? 'focus:border-red-500' : 'focus:border-sky-500'))}`}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-2 ml-1">
                * {importSource === 'qq' ? '在QQ音乐分享歌单链接，复制链接中的数字 ID' : (importSource === 'kuwo' ? '在酷我音乐网页版/分享链接中查找 ID' : (importSource === 'wyy' ? '输入网易云用户歌单ID' : '支持输入酷狗码或概念版歌单链接'))}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowImport(false); setImportId(''); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800  text-slate-300 font-bold text-sm"
              >
                取消
              </button>
              <button
                onClick={handleImportPlaylist}
                disabled={importing || !importId}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${importSource === 'qq' ? 'bg-green-500 hover:bg-green-600' : (importSource === 'kuwo' ? 'bg-yellow-500 hover:bg-yellow-600' : (importSource === 'wyy' ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-500 hover:bg-sky-600'))}`}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Helper component for Logout Icon
const LogOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

export default Mine;