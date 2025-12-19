
import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings, Heart, Clock, Plus,
  BarChart3, User, ChevronRight,
  Download, LogIn, UserCog, ChevronDown, ChevronUp, Import, Loader2,
  Gift
} from 'lucide-react';
import { Playlist } from '../types';
import {
  getUserPlaylists, createUserPlaylist, saveImportedPlaylist
} from '../utils/playlistStore';
import { getListenRecords, ListenRecord } from '../utils/db';
import { formatDuration } from '../utils/time';
import { getOnlinePlaylistConfigList, readOnlinePlaylistFavorites, writeOnlinePlaylistFavorites, ONLINE_PLAYLIST_FAVORITES_EVENT } from '../utils/onlinePlaylistFavorites';
import { fetchQQPlaylist, fetchKuwoPlaylist, fetchWangyiPlaylist, fetchKugouPlaylist } from '../utils/api'; // 鉁?寮曞叆 fetchKuwoPlaylist

const PREVIEW_COVER_CACHE_KEY = 'hm_preview_covers_v1';
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
}

/* ================= 椤甸潰 ================= */

const Mine: React.FC<MineProps> = ({
  onNavigatePlaylist,
  onNavigateSettings,
  onNavigateRecent,
  onNavigateChart,
  onNavigateLocal,
  onNavigateCheckIn
}) => {
  /* ---------- 鐘舵€?---------- */
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [records, setRecords] = useState<ListenRecord[]>([]);
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

  // User State (Mock)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Create Dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  // 鉁?Import Dialog State
  const [showImport, setShowImport] = useState(false);
  // 鉁?淇敼锛歩mportSource 绫诲瀷鍖呭惈 'kuwo'
  const [importSource, setImportSource] = useState<'qq' | 'wyy' | 'kuwo' | 'kugou'>('qq');
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);

  /* ================= 鍒濆鍖?& 鍔犺浇 ================= */

  useEffect(() => {
    const user = localStorage.getItem('user_token');
    if (user) setIsLoggedIn(true);
  }, []);

  const loadOnlineFavorites = () => {
    setFavoriteOnlineIds(readOnlinePlaylistFavorites());
    setFavoriteOnlineCovers(readPreviewCovers());
  };

  const load = async () => {
    setPlaylists(await getUserPlaylists());
    setRecords(await getListenRecords());
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

  const favorite = useMemo(() => playlists.find(p => p.title === '鎴戝枩娆?), [playlists]);
  const otherPlaylists = useMemo(() => playlists.filter(p => p.title !== '鎴戝枩娆?), [playlists]);

  /* ================= 缁熻閫昏緫 ================= */
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

  const totalListenSeconds = useMemo(() => {
    return records.reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
  }, [records]);
  const totalListenText = useMemo(() => formatDuration(totalListenSeconds), [totalListenSeconds]);

  /* ================= 琛屼负 ================= */
  const createPlaylist = async () => {
    if (!newName.trim()) return;
    await createUserPlaylist(newName.trim());
    setNewName('');
    setShowCreate(false);
  };

  // 鉁?澶勭悊姝屽崟瀵煎叆
  const handleImportPlaylist = async () => {
    const id = importId.trim();
    if (!id) {
      window.webapp?.toast?.('璇疯緭鍏ユ瓕鍗旾D');
      return;
    }

    setImporting(true);
    let playlist = null;

    try {
      // 鉁?鍖哄垎鏉ユ簮
      if (importSource === 'qq') {
        playlist = await fetchQQPlaylist(id);
      } else if (importSource === 'kuwo') {
        playlist = await fetchKuwoPlaylist(id);
      } else if (importSource === 'wyy') {
        playlist = await fetchWangyiPlaylist(id);
      } else if (importSource === 'kugou') {
        playlist = await fetchKugouPlaylist(id);
      } else {
        window.webapp?.toast?.('璇ュ钩鍙版殏鏈敮鎸?);
        setImporting(false);
        return;
      }

      if (playlist) {
        await saveImportedPlaylist(playlist);
        window.webapp?.toast?.(`鎴愬姛瀵煎叆: ${playlist.title}`);
        setShowImport(false);
        setImportId('');
      } else {
        window.webapp?.toast?.('瀵煎叆澶辫触锛岃妫€鏌D鏄惁姝ｇ‘');
      }
    } catch (e) {
      window.webapp?.toast?.('缃戠粶閿欒锛岃绋嶅悗閲嶈瘯');
    } finally {
      setImporting(false);
    }
  };

  const handleOpenFavoriteOnline = async (cfg: { id: string; name: string; key: string; type?: string }) => {
    if (!cfg) return;

    if (cfg.type === 'qq_id') {
      if (openingOnlineId) return;
      setOpeningOnlineId(cfg.id);
      window.webapp?.toast?.('姝ｅ湪鑾峰彇姝屽崟...');
      try {
        const pl = await fetchQQPlaylist(cfg.key);
        if (pl) onNavigatePlaylist(pl);
        else window.webapp?.toast?.('鑾峰彇姝屽崟澶辫触');
      } catch (e) {
        window.webapp?.toast?.('缃戠粶閿欒锛岃绋嶅悗閲嶈瘯');
      } finally {
        setOpeningOnlineId(null);
      }
      return;
    }

    const pl: Playlist = {
      id: `dp_${cfg.id}`,
      title: cfg.name,
      creator: 'HillMusic',
      coverUrl: '',
      songCount: 50,
      description: `绮鹃€夊叏缃?{cfg.name}锛屽疄鏃舵洿鏂癭,
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
      window.webapp?.toast?.('宸插彇娑堟敹钘?);
    } else {
      next.add(cfgId);
      window.webapp?.toast?.('宸叉敹钘忔瓕鍗?);
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
    window.webapp?.toast?.('鐧诲綍鎴愬姛 (妯℃嫙)');
  };

  const handleLogout = () => {
    if (!confirm('纭畾閫€鍑虹櫥褰曞悧锛?)) return;
    localStorage.removeItem('user_token');
    setIsLoggedIn(false);
    window.webapp?.toast?.('宸查€€鍑虹櫥褰?);
  };

  // Helper for heatmap colors
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
    <div className="h-full overflow-y-auto bg-[#0f172a] pb-32 no-scrollbar transition-colors">

      {/* 1. 鐢ㄦ埛淇℃伅鍖哄煙 */}
      <div className="pt-10 px-6 pb-8 bg-gradient-to-b from-indigo-900/40 to-[#0f172a] border-b border-transparent">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-indigo-500/30 flex items-center justify-center text-slate-400 overflow-hidden shadow-lg relative group">
              {isLoggedIn ? (
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={32} />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                {isLoggedIn ? '娓稿' : '鏈櫥褰曠敤鎴?}
              </h1>
              <div className="flex gap-3 mt-2 text-xs text-slate-500">
                <span><b className="text-white">{playlists.length}</b> 姝屽崟</span>
                <span><b className="text-white">{totalListenText}</b> 鍚瓕</span>
              </div>
            </div>
          </div>
          <button onClick={onNavigateSettings} className="p-2 bg-slate-800/50 rounded-full hover:bg-slate-700 text-slate-300 transition-colors">
            <Settings size={20} />
          </button>
        </div>

        {/* 鎿嶄綔鎸夐挳 */}
        <div className="flex gap-3">
          {isLoggedIn ? (
            <>
              <button className="flex-1 bg-slate-800  text-slate-300 py-2.5 rounded-xl text-xs font-bold border border-white/5 active:scale-95 transition-transform flex items-center justify-center gap-2">
                <UserCog size={14} /> 缂栬緫璧勬枡
              </button>
              <button onClick={handleLogout} className="flex-1 bg-slate-800 text-red-400 py-2.5 rounded-xl text-xs font-bold border border-white/5 active:scale-95 transition-transform flex items-center justify-center gap-2">
                <LogOutIcon /> 閫€鍑虹櫥褰?
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2">
              <LogIn size={16} /> 绔嬪嵆鐧诲綍
            </button>
          )}
        </div>
      </div>

      {/* 2. 蹇嵎鍏ュ彛 Grid */}
      <div className="px-6 grid grid-cols-2 gap-3 mb-6 mt-6">
        <div
          onClick={() => favorite && onNavigatePlaylist(favorite)}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
            <Heart size={20} className="fill-current" />
          </div>
          <div>
            <div className="text-white font-bold text-sm">鎴戝枩娆?/div>
            <div className="text-xs text-slate-500">{favorite?.songCount || 0} 棣?/div>
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
            <div className="text-white font-bold text-sm">鏈€杩戞挱鏀?/div>
            <div className="text-xs text-slate-500">鍚瓕璁板綍</div>
          </div>
        </div>

        <div
          onClick={() => {
            if (onNavigateLocal) onNavigateLocal();
            else window.webapp?.toast?.('鏈湴闊充箰绠＄悊璇峰墠寰€"鏈湴"椤甸潰');
          }}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Download size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">鏈湴涓嬭浇</div>
            <div className="text-xs text-slate-500">宸茬紦瀛樻瓕鏇?/div>
          </div>
        </div>

        <div
          onClick={() => {
            if (onNavigateCheckIn) onNavigateCheckIn();
            else window.webapp?.toast?.('璇峰墠寰€绛惧埌/绂忓埄椤甸潰鏌ョ湅');
          }}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
            <Gift size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">绂忓埄涓績</div>
            <div className="text-xs text-slate-500">鏉冪泭娲诲姩</div>
          </div>
        </div>
      </div>

      {/* 3. 鍚瓕缁熻 */}
      <div className="px-6 mb-8">
        <div className="bg-slate-800/30 rounded-3xl border border-white/5 overflow-hidden shadow-sm">
          {/* Header */}
          <div
            className="p-5 flex items-center justify-between cursor-pointer active:bg-white/5"
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-indigo-500" size={18} />
              <span className="text-white font-bold text-sm">鍚瓕缁熻</span>
            </div>
            {isStatsExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </div>

          {/* Content */}
          {isStatsExpanded && (
            <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-300">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">鏈€杩?0澶?/p>
                  <p className="text-xl font-bold text-white flex items-baseline gap-1">
                    {totalListenText}
                    <span className="text-xs font-normal text-slate-400">绱</span>
                  </p>
                </div>
                <button
                  onClick={() => onNavigateChart?.()}
                  className="text-xs text-indigo-500 flex items-center gap-1 hover:text-indigo-400"
                >
                  璇︾粏鎶ュ憡 <ChevronRight size={12} />
                </button>
              </div>

              {/* 6*5 鐑姏鍥?*/}
              <div className="grid grid-cols-10 gap-2">
                {heatmapData.map((d, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-md ${getHeatmapColor(d.level)} transition-all hover:scale-110 relative group`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black/80 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {d.date}: {d.minutes}鍒?
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[9px] text-slate-600">灏?/span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-sm bg-slate-700/50"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-400/40"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-500/60"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-500"></div>
                  <div className="w-2 h-2 rounded-sm bg-indigo-400"></div>
                </div>
                <span className="text-[9px] text-slate-600">澶?/span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. 鏀惰棌姝屽崟 */}
      <div className="px-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            鏀惰棌姝屽崟
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
            <p className="text-slate-500 text-xs">鏆傛棤鏀惰棌姝屽崟</p>
            <p className="text-slate-600 text-[10px] mt-1">鍘绘瓕鍗曞箍鍦烘敹钘忎綘鍠滄鐨勫湪绾挎瓕鍗?/p>
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
                    <div className="text-xs text-slate-500 mt-1">{cfg.type === 'qq_id' ? 'QQ瀹樻柟姝屽崟' : '鍦ㄧ嚎绮鹃€夋瓕鍗?}</div>
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

      {/* 5. 鎴戠殑姝屽崟 */}
      <div className="px-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            鎴戠殑姝屽崟
            <span className="text-xs text-slate-500 font-normal">({playlists.length})</span>
          </h2>
          <div className="flex gap-2">
            {/* 鉁?瀵煎叆鎸夐挳 */}
            <button
              onClick={() => { setShowImport(true); setImportId(''); }}
              className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 active:scale-90 transition-transform"
            >
              <Import size={18} />
            </button>
            {/* 鏂板缓鎸夐挳 */}
            <button
              onClick={() => setShowCreate(true)}
              className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 active:scale-90 transition-transform"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {/* 鍏堟樉绀?鎴戝枩娆?姝屽崟 */}
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
                  <span className="text-slate-200">鎴戝枩娆?/span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{favorite.songCount || 0} 棣?路 鎴戠殑绾㈠績姝屾洸</div>
              </div>
            </div>
          )}

          {/* 鍐嶆樉绀哄叾浠栨瓕鍗?*/}
          {otherPlaylists.length === 0 && (
            <div className="text-center py-10 border border-dashed border-slate-700 rounded-2xl bg-slate-800/20">
              <p className="text-slate-500 text-xs">鏆傛棤鑷缓姝屽崟</p>
              <button onClick={() => setShowCreate(true)} className="mt-2 text-indigo-500 text-xs">绔嬪嵆鍒涘缓</button>
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
                  {/* 鉁?瀵煎叆瑙掓爣 */}
                  {isQQ && <div className="absolute top-0 right-0 bg-green-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">QQ</div>}
                  {isKuwo && <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">KW</div>}
                  {isWyy && <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">WY</div>}
                  {isKugou && <div className="absolute top-0 right-0 bg-sky-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">KG</div>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-slate-200 text-sm font-bold truncate max-w-[80%]">{pl.title}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pl.songCount || 0} 棣?路 {isImported ? '澶栭儴瀵煎叆' : pl.description || '鏃犵畝浠?}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog: Create Playlist */}
      {(showCreate) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-xs rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">鏂板缓姝屽崟</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="杈撳叆姝屽崟鍚嶇О" className="w-full bg-slate-800 text-white p-3 rounded-xl text-sm outline-none border border-transparent focus:border-indigo-500" autoFocus />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800  text-slate-300 font-bold text-sm">鍙栨秷</button>
              <button onClick={createPlaylist} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">纭畾</button>
            </div>
          </div>
        </div>
      )}

      {/* 鉁?Dialog: Import Playlist */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">瀵煎叆澶栭儴姝屽崟</h3>

            {/* Source Select */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setImportSource('qq')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'qq' ? 'bg-green-500 text-white border-green-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                QQ闊充箰
              </button>
              {/* 鉁?鍚敤閰锋垜鎸夐挳 */}
              <button
                onClick={() => setImportSource('kuwo')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'kuwo' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                閰锋垜闊充箰
              </button>
              <button
                onClick={() => setImportSource('wyy')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'wyy' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                缃戞槗浜?
              </button>
              <button
                onClick={() => setImportSource('kugou')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'kugou' ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                閰风嫍
              </button>
            </div>

            {/* Input */}
            <div className="mb-2">
              <input
                value={importId}
                onChange={e => setImportId(e.target.value)}
                placeholder={importSource === 'qq' ? "请输入 QQ 歌单 ID (纯数字)" : (importSource === 'kuwo' ? "请输入 酷我 歌单 ID" : (importSource === 'wyy' ? "请输入 网易云 UID" : "请输入 酷狗 歌单 ID/链接"))}
                className={`w-full bg-slate-800  text-white p-3 rounded-xl text-sm outline-none border border-transparent transition-colors ${importSource === 'qq' ? 'focus:border-green-500' : (importSource === 'kuwo' ? 'focus:border-yellow-500' : (importSource === 'wyy' ? 'focus:border-red-500' : 'focus:border-sky-500'))}`}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-2 ml-1">
                * {importSource === 'qq' ? '在QQ音乐分享歌单链接，复制链接中的数字 ID' : (importSource === 'kuwo' ? '在酷我音乐网页版/分享链接中查找 ID (如 2996314807)' : (importSource === 'wyy' ? '输入网易云用户 UID' : '支持输入酷狗歌单 ID 或概念版歌单链接'))}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowImport(false); setImportId(''); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800  text-slate-300 font-bold text-sm"
              >
                鍙栨秷
              </button>
              <button
                onClick={handleImportPlaylist}
                disabled={importing || !importId}
className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${importSource === 'qq' ? 'bg-green-500 hover:bg-green-600' : (importSource === 'kuwo' ? 'bg-yellow-500 hover:bg-yellow-600' : (importSource === 'wyy' ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-500 hover:bg-sky-600'))}`}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : '瀵煎叆'}
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
