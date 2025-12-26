import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, Play, Share2, Loader2, PlusCircle, CheckCircle2,
    MoreVertical, Trash2, Edit3, ArrowUp, ArrowDown, CheckSquare,
    Square, X, ListPlus, Heart, ListMusic, Plus, Download, Search
} from 'lucide-react';
import { Playlist, Song } from '../types';
import { SongItem } from '../components/SongItem';
import { getDynamicPlaylist, fetchSongDetail } from '../utils/api';
import { getPlaylistById, reorderPlaylistSongs, batchRemoveSongsFromPlaylist, updatePlaylistInfo, getUserPlaylists, addSongToPlaylist, removePlaylist, FAVORITE_PLAYLIST_TITLE, FAVORITE_COVER_URL } from '../utils/playlistStore';
import { useSongActions } from '../hooks/useSongActions';
import { getOnlinePlaylistConfigIdFromPlaylist, readOnlinePlaylistFavorites, writeOnlinePlaylistFavorites, ONLINE_PLAYLIST_FAVORITES_EVENT } from '../utils/onlinePlaylistFavorites';
import AddToPlaylistModal from '../components/AddToPlaylistModal'; // ✅ 引入新组件
import { safeToast } from '../utils/fileSystem';
interface PlaylistDetailProps {
    playlist: Playlist;
    onBack: () => void;
    currentSong: Song | null;
    onPlaySong: (song: Song) => void;
    onPlayList: (songs: Song[]) => void;
    onAddToQueue: (song: Song) => void;
    onAddToNext: (song: Song) => void;
    onAddAllToQueue?: (songs: Song[]) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PlaylistDetail: React.FC<PlaylistDetailProps> = ({
    playlist,
    onBack,
    currentSong,
    onPlaySong,
    onPlayList,
    onAddToQueue,
    onAddToNext,
    onAddAllToQueue
}) => {
    // --- 状态管理 ---
    const [playlistData, setPlaylistData] = useState<Playlist>(playlist);
    const [songs, setSongs] = useState<Song[]>(playlist.songs || []);
    const [loading, setLoading] = useState(false);

    // UI 状态
    const [showMoreMenu, setShowMoreMenu] = useState(false); // 右上角菜单
    const [showAddMenu, setShowAddMenu] = useState(false);   // 点击加号后的菜单
    const [showEditModal, setShowEditModal] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // ✅ 新增：添加到歌单弹窗状态
    const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
    const [songsToAdd, setSongsToAdd] = useState<Song[]>([]);

    // 批量模式状态
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [favoriteSongIds, setFavoriteSongIds] = useState<Set<string>>(new Set());

    // 编辑状态
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editCover, setEditCover] = useState('');

    // 引入 SongActions 用于批量操作
    const songActions = useSongActions({ addToQueue: onAddToQueue, addToNext: onAddToNext, addAllToQueue: onAddAllToQueue });

    const isMountedRef = useRef(true);
    const isLocalPlaylist = useMemo(() => !playlist.apiKeyword, [playlist.apiKeyword]);
    const onlineConfigId = useMemo(() => getOnlinePlaylistConfigIdFromPlaylist(playlist), [playlist]);
    const [isOnlineFavorite, setIsOnlineFavorite] = useState(false);
    const isFavoritePlaylist = useMemo(() => playlist.title === '我喜欢', [playlist.title]);

    // 计算显示封面
    const displayCover = useMemo(() => {
        // 默认“我喜欢”封面为红心图
        if (isFavoritePlaylist) {
            return playlistData.coverUrl || FAVORITE_COVER_URL;
        }
        if (playlistData.coverUrl && !playlistData.coverUrl.includes('unsplash')) return playlistData.coverUrl;
        if (songs.length > 0 && songs[0].coverUrl) return songs[0].coverUrl;
        return playlistData.coverUrl; // fallback
    }, [playlistData.coverUrl, songs, isFavoritePlaylist]);

    const visibleSongs = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return songs;
        return songs.filter((s) => {
            const title = s.title?.toLowerCase() || '';
            const artist = s.artist?.toLowerCase() || '';
            const album = s.album?.toLowerCase() || '';
            return title.includes(keyword) || artist.includes(keyword) || album.includes(keyword);
        });
    }, [songs, searchTerm]);

    useEffect(() => {
        if (showSearch) {
            setTimeout(() => searchInputRef.current?.focus(), 30);
        }
    }, [showSearch]);

    useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set<string>();
            visibleSongs.forEach((s) => {
                if (prev.has(s.id)) next.add(s.id);
            });
            return next.size === prev.size ? prev : next;
        });
    }, [visibleSongs]);

    // --- 数据加载 ---
    const loadFromDB = async () => {
        if (!isLocalPlaylist) return;
        const pl = await getPlaylistById(playlist.id);
        if (pl) {
            setPlaylistData(pl);
            setSongs(pl.songs || []);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;

        // 封面缓存 key
        const coverCacheKey = 'hm_playlist_cover_cache_v1';
        const COVER_TTL = 6 * 60 * 60 * 1000;

        const readCover = () => {
            try {
                const raw = sessionStorage.getItem(coverCacheKey);
                if (!raw) return {};
                return JSON.parse(raw);
            } catch { return {}; }
        };
        const writeCover = (cache: any) => {
            try { sessionStorage.setItem(coverCacheKey, JSON.stringify(cache)); } catch { }
        };

        const run = async () => {
            setLoading(true);
            try {
                if (playlist.apiKeyword) {
                    const fetched = await getDynamicPlaylist(playlist.apiKeyword);
                    if (!isMountedRef.current) return;
                    setSongs(fetched);

                    // 尝试封面缓存
                    const cache = readCover();
                    const cached = cache[playlist.id];
                    if (cached && Date.now() - cached.ts < COVER_TTL) {
                        setPlaylistData(p => ({ ...p, coverUrl: cached.cover || p.coverUrl }));
                    } else {
                        const coverCandidates = fetched.slice(0, 3);
                        const detailed = await Promise.all(coverCandidates.map(s => fetchSongDetail(s).catch(() => s)));
                        const cover = detailed.find(s => s.coverUrl)?.coverUrl || fetched[0]?.coverUrl;
                        if (cover) {
                            setPlaylistData(p => ({ ...p, coverUrl: cover }));
                            cache[playlist.id] = { cover, ts: Date.now() };
                            writeCover(cache);
                        }
                    }
                    setLoading(false);
                } else {
                    await loadFromDB();
                    if (!isMountedRef.current) return;
                    setLoading(false);
                }
            } catch (e) {
                if (isMountedRef.current) setLoading(false);
            }
        };
        run();
        const onUpdate = () => loadFromDB();
        window.addEventListener('playlist-updated', onUpdate);
        return () => {
            isMountedRef.current = false;
            window.removeEventListener('playlist-updated', onUpdate);
        };
    }, [playlist.id, playlist.apiKeyword]);

    useEffect(() => {
        const refreshOnlineFav = () => {
            if (!onlineConfigId) {
                setIsOnlineFavorite(false);
                return;
            }
            const set = readOnlinePlaylistFavorites();
            setIsOnlineFavorite(set.has(onlineConfigId));
        };

        refreshOnlineFav();
        window.addEventListener(ONLINE_PLAYLIST_FAVORITES_EVENT, refreshOnlineFav);
        return () => {
            window.removeEventListener(ONLINE_PLAYLIST_FAVORITES_EVENT, refreshOnlineFav);
        };
    }, [onlineConfigId]);

    // --- 播放逻辑 ---
    const handlePlayAll = () => {
        if (visibleSongs.length > 0) {
            onPlayList(visibleSongs);
            safeToast(`开始播放 ${visibleSongs.length} 首歌曲`);
        }
    };

    // --- 批量/添加逻辑 ---

    const handleSelectAll = () => {
        if (visibleSongs.length === 0) return;
        if (selectedIds.size === visibleSongs.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(visibleSongs.map(s => s.id)));
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const getSelectedSongs = () => songs.filter(s => selectedIds.has(s.id));
    const areSongsAllFavorite = (list: Song[]) => list.length > 0 && list.every(s => favoriteSongIds.has(s.id));

    // 读取“我喜欢”歌曲集合
    const refreshFavoriteIds = async () => {
        const playlists = await getUserPlaylists();
        const fav = playlists.find(p => p.title === FAVORITE_PLAYLIST_TITLE);
        setFavoriteSongIds(new Set(fav?.songs?.map(s => s.id)));
    };

    useEffect(() => {
        refreshFavoriteIds();
        const handler = () => refreshFavoriteIds();
        window.addEventListener('playlist-updated', handler);
        return () => window.removeEventListener('playlist-updated', handler);
    }, []);

    // 批量删除 (仅本地)
    const handleBatchDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!confirm(`确定从歌单删除这 ${ids.length} 首歌曲吗？`)) return;

        await batchRemoveSongsFromPlaylist(playlist.id, ids);
        setBulkMode(false);
        setSelectedIds(new Set());
        safeToast(`已删除 ${ids.length} 首歌曲`);
    };

    // 歌单菜单操作
    const openEdit = () => {
        setEditTitle(playlistData.title || '');
        setEditDesc(playlistData.description || '');
        setEditCover(playlistData.coverUrl || '');
        setShowEditModal(true);
        setShowMoreMenu(false);
    };

    const saveEdit = async () => {
        await updatePlaylistInfo(playlist.id, {
            title: editTitle,
            description: editDesc,
            coverUrl: editCover
        });
        safeToast('歌单信息已更新');
        setShowEditModal(false);
    };

    const delPlaylist = async (pl: Playlist) => {
        if (isFavoritePlaylist) {
            safeToast('"我喜欢"不能删除');
            return;
        }
        if (!confirm(`确定删除「${pl.title}」？`)) return;
        await removePlaylist(pl.id);
        onBack(); // 返回上一页
    };

    const toggleOnlineFavorite = () => {
        if (!onlineConfigId) return;
        const next = readOnlinePlaylistFavorites();
        if (next.has(onlineConfigId)) {
            next.delete(onlineConfigId);
            safeToast('已取消收藏');
        } else {
            next.add(onlineConfigId);
            safeToast('已收藏歌单');
        }
        writeOnlinePlaylistFavorites(next);
        setIsOnlineFavorite(next.has(onlineConfigId));
    };

    return (
        <div className="h-full overflow-y-auto no-scrollbar  bg-[#121212] pb-20 animate-in slide-in-from-bottom-10 duration-300 relative">

            {/* 顶部背景 */}
            <div className="relative h-72 w-full overflow-hidden">
                <img
                    src={displayCover}
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-50 scale-125"
                    alt="bg"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#121212]/40 to-[#121212]" />

                {/* 导航栏 */}
                <div className="absolute top-0 left-0 right-0 p-4 pt-6 flex items-center justify-between z-20">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full backdrop-blur-md transition-colors">
                        <ArrowLeft size={24} className="text-white" />
                    </button>
                    <div className="flex gap-2 relative">
                        <button
                            onClick={() => { setShowSearch(!showSearch); setShowMoreMenu(false); }}
                            className={`p-2 rounded-full backdrop-blur-md transition-colors ${showSearch ? 'bg-white text-slate-900' : 'hover:bg-white/10 text-white'}`}
                        >
                            <Search size={22} />
                        </button>
                        {/* 更多菜单按钮 */}
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className="p-2 hover:bg-white/10 rounded-full text-white backdrop-blur-md transition-colors"
                        >
                            <MoreVertical size={24} />
                        </button>

                        {/* 右上角下拉菜单 */}
                        {showMoreMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                                <div className="absolute right-0 top-12 w-40 bg-[#121212] rounded-xl shadow-2xl border border-white/10 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                                    {!isLocalPlaylist && (
                                        <button onClick={() => { safeToast.toast?.('分享功能开发中'); setShowMoreMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2">
                                            <Share2 size={16} /> 分享歌单
                                        </button>
                                    )}
                                    {!isLocalPlaylist && onlineConfigId && (
                                        <button
                                            onClick={() => { toggleOnlineFavorite(); setShowMoreMenu(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2"
                                        >
                                            <Heart size={16} className={isOnlineFavorite ? 'fill-current text-rose-400' : ''} />
                                            {isOnlineFavorite ? '取消收藏' : '收藏歌单'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setBulkMode(!bulkMode);
                                            setShowMoreMenu(false);
                                            setSelectedIds(new Set());
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2"
                                    >
                                        <CheckSquare size={16} /> {bulkMode ? '退出批量' : '批量管理'}
                                    </button>
                                    {isLocalPlaylist && !isFavoritePlaylist && (
                                        <>
                                            <button onClick={openEdit} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2">
                                                <Edit3 size={16} /> 编辑信息
                                            </button>
                                            <button onClick={() => delPlaylist(playlistData)} className="w-full text-left px-4 py-3 text-xs text-red-400 flex gap-2 hover:bg-white/5 border-t border-white/5">
                                                <Trash2 size={14} /> 删除
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 歌单信息区 */}
                {showSearch && (
                    <div className="absolute left-4 right-4 top-16 z-30">
                        <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-full px-3 py-2 backdrop-blur-md shadow-lg">
                            <Search size={16} className="text-slate-300" />
                            <input
                                ref={searchInputRef}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜索歌单内歌曲"
                                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none border-none"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="p-1 text-slate-400 hover:text-white">
                                    <X size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                                className="p-1 text-slate-400 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}

                <div className="absolute bottom-6 left-6 right-6 z-10 flex gap-5 items-end">
                    <div className="w-32 h-32 rounded-xl shadow-2xl overflow-hidden border border-white/10 relative group">
                        <img src={displayCover} className="w-full h-full object-cover" alt="cover" />
                    </div>
                    <div className="flex-1 min-w-0 mb-1">
                        <h1 className="text-xl font-bold text-white mb-2 line-clamp-2 leading-tight shadow-black drop-shadow-md">
                            {playlistData.title}
                        </h1>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-slate-200 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-md">
                                {playlistData.creator}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-300 line-clamp-2 opacity-80">
                            {playlistData.description || '暂无简介'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 功能按钮栏 */}
            {!bulkMode && (
                <div className="px-6 mt-2 mb-6 flex items-center gap-3">
                    {/* 播放全部按钮 */}
                    <button
                        onClick={handlePlayAll}
                        disabled={visibleSongs.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-full shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                        <span className="font-bold text-sm">播放全部</span>
                        <span className="text-xs opacity-70 font-medium">({searchTerm.trim() ? `${visibleSongs.length}/${songs.length}` : visibleSongs.length})</span>
                    </button>

                    {/* 添加到...按钮 */}
                    <div className="relative">
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            disabled={visibleSongs.length === 0}
                            className={`p-3 rounded-full border border-white/10 shadow-lg transition-colors ${showAddMenu ? 'bg-white text-slate-900' : 'bg-[#121212] text-slate-200 hover:bg-slate-700'
                                }`}
                        >
                            <PlusCircle size={20} />
                        </button>

                        {/* 添加菜单 Popup */}
                        {showAddMenu && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowAddMenu(false)} />
                                <div className="absolute top-12 right-0 w-48 bg-[#121212] rounded-xl shadow-xl border border-white/10 z-30 overflow-hidden animate-in fade-in zoom-in-95">
                                    <button
                                        onClick={() => { songActions.handleBatchAddToQueue(visibleSongs); setShowAddMenu(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2"
                                    >
                                        <ListPlus size={16} /> 加入播放队列
                                    </button>
                                    {!isFavoritePlaylist && (
                                        <>
                                            <button
                                                onClick={() => { songActions.handleBatchAddToFavorites(visibleSongs); setShowAddMenu(false); }}
                                                className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2"
                                            >
                                                <Heart size={16} className={areSongsAllFavorite(visibleSongs) ? 'text-rose-400 fill-current' : ''} /> {areSongsAllFavorite(visibleSongs) ? '移出我喜欢' : '加入我喜欢'}
                                            </button>
                                        </>
                                    )}

                                    {/* ✅ 新增：添加到歌单 */}
                                    <button
                                        onClick={() => {
                                            setSongsToAdd(visibleSongs);
                                            setShowAddToPlaylist(true);
                                            setShowAddMenu(false);
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white flex items-center gap-2"
                                    >
                                        <ListMusic size={16} /> 添加到歌单
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* 批量操作工具栏 (悬浮) */}
            {bulkMode && (
                <div className="sticky top-0 z-20  bg-[#121212]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setBulkMode(false)} className="text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                        <span className="text-sm font-bold text-white">已选 {selectedIds.size} 首</span>
                    </div>
                    <button
                        onClick={handleSelectAll}
                        className="text-xs text-indigo-400 font-medium hover:text-indigo-300"
                    >
                        {selectedIds.size === visibleSongs.length ? '取消全选' : '全选'}
                    </button>
                </div>
            )}

            {/* 歌曲列表 */}
            <div className={`px-4 min-h-[300px] ${bulkMode ? 'pb-24' : ''}`}>
                {searchTerm.trim() && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                        <span>找到 {visibleSongs.length} 首匹配</span>
                        <button onClick={() => setSearchTerm('')} className="text-indigo-400 hover:text-indigo-300">清空搜索</button>
                    </div>
                )}

                {loading && songs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs">正在加载歌单资源...</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {visibleSongs.map((song, idx) => {
                            const isSelected = selectedIds.has(song.id);
                            const originalIndex = songs.findIndex((s) => s.id === song.id);
                            return (
                                <div key={`${song.id}-${idx}`} className="flex items-center group rounded-xl transition-colors hover:bg-white/5">
                                    {/* 批量选择 Checkbox */}
                                    {bulkMode && (
                                        <div
                                            className="pl-3 pr-1 py-4 cursor-pointer"
                                            onClick={() => toggleSelect(song.id)}
                                        >
                                            {isSelected
                                                ? <CheckSquare size={20} className="text-indigo-500 fill-indigo-500/20" />
                                                : <Square size={20} className="text-slate-500" />
                                            }
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0" onClick={() => bulkMode ? toggleSelect(song.id) : null}>
                                            <SongItem
                                                index={idx}
                                                song={song}
                                                isActive={!bulkMode && currentSong?.id === song.id}
                                                onPlaySong={!bulkMode ? onPlaySong : undefined} // 批量模式下禁用直接播放
                                                onAddToQueue={onAddToQueue}
                                                onAddToNext={onAddToNext}
                                                showCover={false}
                                                showIndex={!bulkMode}
                                                showMoreButton={!bulkMode}
                                            />
                                    </div>

                                    {/* 排序按钮 (仅非批量本地模式显示) */}
                                    {isLocalPlaylist && !bulkMode && (
                                        <div className="flex flex-col gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => reorderPlaylistSongs(playlist.id, (() => {
                                                    const newSongs = [...songs];
                                                    if (originalIndex > 0) {
                                                        [newSongs[originalIndex], newSongs[originalIndex - 1]] = [newSongs[originalIndex - 1], newSongs[originalIndex]];
                                                        setSongs(newSongs);
                                                        return newSongs;
                                                    }
                                                    return songs;
                                                })())}
                                                className="text-slate-600 hover:text-white"
                                            >
                                                <ArrowUp size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {!loading && visibleSongs.length === 0 && (
                            <div className="text-center py-20 text-slate-500 text-xs">
                                {songs.length === 0 ? '歌单空空如也' : '未找到匹配的歌曲'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 批量操作底部栏 */}
            {bulkMode && selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-white/5 p-4 z-30 animate-in slide-in-from-bottom flex justify-around safe-area-bottom">
                    <button
                        onClick={() => {
                            songActions.handleBatchAddToQueue(getSelectedSongs());
                            setBulkMode(false);
                            setSelectedIds(new Set());
                        }}
                        className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
                    >
                        <ListPlus size={20} />
                        <span className="text-[10px]">加入队列</span>
                    </button>
                    {!isFavoritePlaylist && (
                        <>
                            <button
                                onClick={() => {
                                    songActions.handleBatchAddToFavorites(getSelectedSongs());
                                    setBulkMode(false);
                                    setSelectedIds(new Set());
                                }}
                                className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
                            >
                                <Heart size={20} className={areSongsAllFavorite(getSelectedSongs()) ? 'text-rose-400 fill-current' : ''} />
                                <span className="text-[10px]">{areSongsAllFavorite(getSelectedSongs()) ? '取消收藏' : '收藏'}</span>
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => {
                            setSongsToAdd(getSelectedSongs());
                            setShowAddToPlaylist(true);
                            setBulkMode(false);
                            setSelectedIds(new Set());
                        }}
                        className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
                    >
                        <ListMusic size={20} />
                        <span className="text-[10px]">添加到歌单</span>
                    </button>

                    <button
                        onClick={() => {
                            songActions.handleBatchDownload(getSelectedSongs());
                            setBulkMode(false);
                            setSelectedIds(new Set());
                        }}
                        className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
                    >
                        <Download size={20} />
                        <span className="text-[10px]">批量下载</span>
                    </button>

                    {isLocalPlaylist && (
                        <button
                            onClick={handleBatchDelete}
                            className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300"
                        >
                            <Trash2 size={20} />
                            <span className="text-[10px]">删除</span>
                        </button>
                    )}
                </div>
            )}

            {/* 编辑弹窗 */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className=" bg-slate-600 w-full max-w-xs rounded-2xl p-5 border border-white/10 shadow-2xl relative">
                        <button onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
                        <h3 className="text-white font-bold text-lg mb-4 text-center">编辑歌单</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">标题</label>
                                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-[#121212] text-white px-3 py-2 rounded-lg text-sm border border-white/10 focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">简介</label>
                                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full bg-[#121212] text-white px-3 py-2 rounded-lg text-sm border border-white/10 focus:border-indigo-500 outline-none resize-none" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">封面图片链接</label>
                                <input value={editCover} onChange={e => setEditCover(e.target.value)} className="w-full bg-[#121212] text-white px-3 py-2 rounded-lg text-sm border border-white/10 focus:border-indigo-500 outline-none" placeholder="https://..." />
                            </div>
                            <button onClick={saveEdit} className="w-full py-2.5 mt-2 bg-indigo-600 rounded-xl text-white font-bold text-sm hover:bg-indigo-500">保存修改</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ 渲染添加歌单弹窗 */}
            <AddToPlaylistModal
                open={showAddToPlaylist}
                songs={songsToAdd}
                onClose={() => setShowAddToPlaylist(false)}
            />
        </div>
    );
};

export default PlaylistDetail;
