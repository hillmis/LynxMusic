
import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings, Heart, Clock, Plus,
  BarChart3, User, ChevronRight,
  Download, FolderOpen, LogIn, UserCog, ChevronDown, ChevronUp, Globe, Import, Loader2
} from 'lucide-react';
import { Playlist } from '../types';
import {
  getUserPlaylists, createUserPlaylist, saveImportedPlaylist
} from '../utils/playlistStore';
import { getListenRecords } from '../utils/db';
import { fetchQQPlaylist, fetchKuwoPlaylist } from '../utils/api'; // ✅ 引入 fetchKuwoPlaylist

/* ================= Props ================= */

interface MineProps {
  onNavigatePlaylist: (playlist: Playlist) => void;
  onNavigateSettings: () => void;
  onNavigateRecent?: () => void;
  onNavigateChart?: () => void;
  onNavigateLocal?: () => void;
}

/* ================= 页面 ================= */

const Mine: React.FC<MineProps> = ({
  onNavigatePlaylist,
  onNavigateSettings,
  onNavigateRecent,
  onNavigateChart,
  onNavigateLocal
}) => {
  /* ---------- 状态 ---------- */
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [records, setRecords] = useState<any[]>([]);

  // Stats Collapse State
  const [isStatsExpanded, setIsStatsExpanded] = useState(true);

  // User State (Mock)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Create Dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  // ✅ Import Dialog State
  const [showImport, setShowImport] = useState(false);
  // ✅ 修改：importSource 类型包含 'kuwo'
  const [importSource, setImportSource] = useState<'qq' | 'wyy' | 'kuwo'>('qq');
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);

  /* ================= 初始化 & 加载 ================= */

  useEffect(() => {
    const user = localStorage.getItem('user_token');
    if (user) setIsLoggedIn(true);
  }, []);

  const load = async () => {
    setPlaylists(await getUserPlaylists());
    setRecords(await getListenRecords());
  };

  useEffect(() => {
    load();
    window.addEventListener('playlist-updated', load);
    return () => window.removeEventListener('playlist-updated', load);
  }, []);

  const favorite = useMemo(() => playlists.find(p => p.title === '我喜欢'), [playlists]);
  const otherPlaylists = useMemo(() => playlists.filter(p => p.title !== '我喜欢'), [playlists]);

  /* ================= 统计逻辑 ================= */
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

  const totalListenMinutes = useMemo(() => {
    return Math.round(records.reduce((acc, cur) => acc + cur.playedSeconds, 0) / 60);
  }, [records]);

  /* ================= 行为 ================= */
  const createPlaylist = async () => {
    if (!newName.trim()) return;
    await createUserPlaylist(newName.trim());
    setNewName('');
    setShowCreate(false);
  };

  // ✅ 处理歌单导入
  const handleImportPlaylist = async () => {
    const id = importId.trim();
    if (!id) {
      window.webapp?.toast?.('请输入歌单ID');
      return;
    }

    setImporting(true);
    let playlist = null;

    try {
      // ✅ 区分来源
      if (importSource === 'qq') {
        playlist = await fetchQQPlaylist(id);
      } else if (importSource === 'kuwo') {
        playlist = await fetchKuwoPlaylist(id);
      } else {
        window.webapp?.toast?.('该平台暂未支持');
        setImporting(false);
        return;
      }

      if (playlist) {
        await saveImportedPlaylist(playlist);
        window.webapp?.toast?.(`成功导入: ${playlist.title}`);
        setShowImport(false);
        setImportId('');
      } else {
        window.webapp?.toast?.('导入失败，请检查ID是否正确');
      }
    } catch (e) {
      window.webapp?.toast?.('网络错误，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const handleLogin = () => {
    localStorage.setItem('user_token', 'mock_token');
    setIsLoggedIn(true);
    window.webapp?.toast?.('登录成功 (模拟)');
  };

  const handleLogout = () => {
    if (!confirm('确定退出登录吗？')) return;
    localStorage.removeItem('user_token');
    setIsLoggedIn(false);
    window.webapp?.toast?.('已退出登录');
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

      {/* 1. 用户信息区域 */}
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
                {isLoggedIn ? '游客' : '未登录用户'}
              </h1>
              <div className="flex gap-3 mt-2 text-xs text-slate-500">
                <span><b className="text-white">{playlists.length}</b> 歌单</span>
                <span><b className="text-white">{totalListenMinutes}</b> 分钟</span>
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
              <button className="flex-1 bg-slate-800  text-slate-300 py-2.5 rounded-xl text-xs font-bold border border-white/5 active:scale-95 transition-transform flex items-center justify-center gap-2">
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
      <div className="px-6 grid grid-cols-2 gap-3 mb-6 mt-6">
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
            if (onNavigateLocal) onNavigateLocal();
            else window.webapp?.toast?.('本地音乐管理请前往"本地"页面');
          }}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Download size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">本地下载</div>
            <div className="text-xs text-slate-500">已缓存歌曲</div>
          </div>
        </div>

        <div
          onClick={() => window.webapp?.toast?.('福利中心即将上线')}
          className="bg-slate-800/40 p-4 rounded-2xl flex items-center gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
            <Gift size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm">福利中心</div>
            <div className="text-xs text-slate-500">签到 · 权益 · 活动</div>
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
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">最近30天</p>
                  <p className="text-xl font-bold text-white flex items-baseline gap-1">
                    {totalListenMinutes}
                    <span className="text-xs font-normal text-slate-400">分钟</span>
                  </p>
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
            </div>
          )}
        </div>
      </div>

      {/* 4. 我的歌单 */}
      <div className="px-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            我的歌单
            <span className="text-xs text-slate-500 font-normal">({playlists.length})</span>
          </h2>
          <div className="flex gap-2">
            {/* ✅ 导入按钮 */}
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
            const isImported = isQQ || isKuwo;

            return (
              <div
                key={pl.id}
                className="flex items-center p-3 rounded-2xl hover:bg-slate-800/60 transition-colors relative group border border-transparent hover:border-white/5 active:scale-[0.99]"
                onClick={() => onNavigatePlaylist(pl)}
              >
                <div className="w-14 h-14 rounded-xl mr-3 bg-slate-800 shadow-md overflow-hidden flex-shrink-0 relative">
                  <img src={pl.coverUrl} className="w-full h-full object-cover" alt={pl.title} />
                  {/* ✅ 导入角标 */}
                  {isQQ && <div className="absolute top-0 right-0 bg-green-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">QQ</div>}
                  {isKuwo && <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[8px] px-1 rounded-bl-md font-bold shadow-sm">KW</div>}
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
          <div className="bg-slate-900 w-full max-w-xs rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">新建歌单</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入歌单名称" className="w-full bg-slate-800 text-white p-3 rounded-xl text-sm outline-none border border-transparent focus:border-indigo-500" autoFocus />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800  text-slate-300 font-bold text-sm">取消</button>
              <button onClick={createPlaylist} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Dialog: Import Playlist */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">导入外部歌单</h3>

            {/* Source Select */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setImportSource('qq')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'qq' ? 'bg-green-500 text-white border-green-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                QQ音乐
              </button>
              {/* ✅ 启用酷我按钮 */}
              <button
                onClick={() => setImportSource('kuwo')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${importSource === 'kuwo' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-slate-800 text-slate-500 border-transparent'}`}
              >
                酷我音乐
              </button>
              <button
                onClick={() => window.webapp?.toast?.('网易云导入开发中...')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border bg-slate-800 text-slate-400 border-transparent opacity-50 cursor-not-allowed`}
              >
                网易云
              </button>
            </div>

            {/* Input */}
            <div className="mb-2">
              <input
                value={importId}
                onChange={e => setImportId(e.target.value)}
                placeholder={importSource === 'qq' ? "请输入 QQ 歌单 ID (纯数字)" : "请输入 酷我 歌单 ID"}
                className={`w-full bg-slate-800  text-white p-3 rounded-xl text-sm outline-none border border-transparent transition-colors ${importSource === 'qq' ? 'focus:border-green-500' : 'focus:border-yellow-500'}`}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-2 ml-1">
                * {importSource === 'qq' ? '在QQ音乐分享歌单链接，复制链接中的数字 ID' : '在酷我音乐网页版/分享链接中查找 ID (如 2996314807)'}
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
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${importSource === 'qq' ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
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
