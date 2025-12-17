import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, Heart, ListPlus, Loader2, Import, Globe } from 'lucide-react';
import { Playlist, Song } from '../types';
import { DYNAMIC_PLAYLIST_CONFIG } from '../constants';
import { searchMusic, fetchSongDetail, fetchQQPlaylist } from '../utils/api'; // ✅ 引入 fetchQQPlaylist
import { useAudioPlayer } from '../hooks/useAudioPlayer';

/**
 * =========================
 * 工具与缓存
 * =========================
 */

// 预览封面缓存（内存 + localStorage）
const LS_PREVIEW_COVERS = 'hm_preview_covers_v1';
type PreviewCoversCache = Record<string, { ts: number; covers: string[] }>;

const readCoversCache = (): PreviewCoversCache => {
    try {
        const raw = localStorage.getItem(LS_PREVIEW_COVERS);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

const writeCoversCache = (cache: PreviewCoversCache) => {
    try {
        localStorage.setItem(LS_PREVIEW_COVERS, JSON.stringify(cache));
    } catch { }
};

// 收藏歌单（仅歌单广场用）
const LS_FAV_PLAYLISTS = 'hm_fav_playlists_v1';
const readFavSet = (): Set<string> => {
    try {
        const raw = localStorage.getItem(LS_FAV_PLAYLISTS);
        const arr = raw ? (JSON.parse(raw) as string[]) : [];
        return new Set(arr || []);
    } catch {
        return new Set();
    }
};
const writeFavSet = (set: Set<string>) => {
    try {
        localStorage.setItem(LS_FAV_PLAYLISTS, JSON.stringify(Array.from(set)));
    } catch { }
};

// Toast
const toast = (msg: string) => {
    window.webapp?.toast?.(msg);
    if (!window.webapp?.toast) console.log('[toast]', msg);
};

// 节流
const throttle = (fn: () => void, wait = 250) => {
    let t = 0;
    return () => {
        const now = Date.now();
        if (now - t > wait) {
            t = now;
            fn();
        }
    };
};

/**
 * =========================
 * 封面拼贴（网易云风）
 * =========================
 */
const MosaicCover: React.FC<{
    covers?: string[];
    fallback?: string;
    className?: string;
}> = ({ covers = [], fallback, className }) => {
    const imgs = covers.filter(Boolean).slice(0, 4);

    // 2x2：0 1 / 2 0
    const a = imgs[0] || fallback;
    const b = imgs[1] || imgs[0] || fallback;
    const c = imgs[2] || imgs[0] || fallback;
    const d = imgs[3] || imgs[0] || fallback;

    return (
        <div className={`relative overflow-hidden rounded-xl bg-[#0f172a] ${className || ''}`}>
            {/* 背景模糊 */}
            <div className="absolute inset-0">
                <img
                    src={a || fallback}
                    alt=""
                    className="w-full h-full object-cover blur-xl scale-110 opacity-40"
                    loading="lazy"
                />
            </div>

            <div className="relative grid grid-cols-2 grid-rows-2 gap-[2px] p-[2px]">
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-700">
                    {a ? <img src={a} className="w-full h-full object-cover" alt="" loading="lazy" /> : null}
                </div>
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-700">
                    {b ? <img src={b} className="w-full h-full object-cover" alt="" loading="lazy" /> : null}
                </div>
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-700">
                    {c ? <img src={c} className="w-full h-full object-cover" alt="" loading="lazy" /> : null}
                </div>
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-700">
                    {d ? <img src={d} className="w-full h-full object-cover" alt="" loading="lazy" /> : null}
                </div>
            </div>

            {/* 轻阴影 */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 to-black/20" />
        </div>
    );
};

/**
 * =========================
 * 右滑动作行（收藏 / 加入队列）
 * =========================
 */
const SwipeRow: React.FC<{
    rowKey: string;
    openKey: string | null;
    setOpenKey: (k: string | null) => void;
    left: React.ReactNode;
    rightActions: React.ReactNode;
    className?: string;
}> = ({ rowKey, openKey, setOpenKey, left, rightActions, className }) => {
    const isOpen = openKey === rowKey;
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const startX = useRef(0);
    const startY = useRef(0);
    const dragging = useRef(false);
    const dxRef = useRef(0);

    const ACTION_WIDTH = 132; // 2 按钮宽度合计（约）

    const setTranslate = (dx: number) => {
        dxRef.current = dx;
        if (wrapRef.current) {
            wrapRef.current.style.transform = `translateX(${dx}px)`;
        }
    };

    const reset = () => {
        setTranslate(0);
        setOpenKey(null);
    };

    useEffect(() => {
        // 外部关闭
        if (!isOpen) setTranslate(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const onPointerDown = (e: React.PointerEvent) => {
        dragging.current = true;
        startX.current = e.clientX;
        startY.current = e.clientY;
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging.current) return;
        const dx = e.clientX - startX.current;
        const dy = e.clientY - startY.current;

        // 纵向滚动优先：dy 更大则退出
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
            dragging.current = false;
            return;
        }

        // 左滑打开：dx < 0
        const base = isOpen ? -ACTION_WIDTH : 0;
        let next = base + dx;

        // 限制范围
        next = Math.max(-ACTION_WIDTH, Math.min(0, next));
        setTranslate(next);
    };

    const onPointerUp = () => {
        if (!dragging.current) return;
        dragging.current = false;

        // 根据当前偏移决定开关
        const dx = dxRef.current;
        if (dx <= -ACTION_WIDTH * 0.55) {
            setOpenKey(rowKey);
            setTranslate(-ACTION_WIDTH);
        } else {
            reset();
        }
    };

    return (
        <div className={`relative overflow-hidden ${className || ''}`}>
            {/* 右侧动作 */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                {rightActions}
            </div>

            {/* 内容区 */}
            <div
                ref={wrapRef}
                className="relative will-change-transform transition-transform duration-200"
                style={{ transform: isOpen ? `translateX(-${ACTION_WIDTH}px)` : 'translateX(0px)' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {left}
            </div>

            {/* 遮罩点击收起 */}
            {isOpen && (
                <button
                    className="absolute inset-0 z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        reset();
                    }}
                    aria-label="close-swipe"
                />
            )}
        </div>
    );
};

/**
 * =========================
 * 页面：歌单广场
 * =========================
 */
interface SeeAllPlaylistsProps {
    onBack: () => void;
    onNavigatePlaylist: (playlist: Playlist) => void;
}

const CARD_GRADIENTS = [
    'bg-gradient-to-br from-yellow-500 to-orange-600',
    'bg-gradient-to-br from-stone-500 to-stone-700',
    'bg-gradient-to-br from-amber-700 to-amber-900',
    'bg-gradient-to-br from-slate-600 to-slate-800',
    'bg-gradient-to-br from-red-700 to-red-900',
    'bg-gradient-to-br from-orange-400 to-red-500',
    'bg-gradient-to-br from-cyan-600 to-blue-700',
    'bg-gradient-to-br from-purple-600 to-pink-600',
];

type DynamicCfg = { id: string | number; name: string; key: string; tag?: string };

const SeeAllPlaylists: React.FC<SeeAllPlaylistsProps> = ({ onBack, onNavigatePlaylist }) => {
    const player = useAudioPlayer();

    // 搜索/筛选
    const [q, setQ] = useState('');
    const [activeTag, setActiveTag] = useState<string>('全部');

    // ✅ 新增：正在导入状态
    const [importing, setImporting] = useState(false);

    // 无限滚动（分批加载 DYNAMIC_PLAYLIST_CONFIG）
    const BATCH = 10;
    const [page, setPage] = useState(1);

    // 预览封面 map
    const [coversMap, setCoversMap] = useState<Record<string, string[]>>({});
    const loadingCoversRef = useRef<Set<string>>(new Set());

    // 收藏
    const [favSet, setFavSet] = useState<Set<string>>(() => readFavSet());

    // Swipe open
    const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);

    // Sentinel
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const cfgList: DynamicCfg[] = useMemo(() => {
        return (DYNAMIC_PLAYLIST_CONFIG as any[]).map((x) => ({
            id: x.id,
            name: x.name,
            key: x.key,
            tag: x.tag || x.group || x.category,
            type: x.type || 'keyword' // 默认为关键词搜索
        }));
    }, []);

    const tags = useMemo(() => {
        const set = new Set<string>();
        set.add('全部');
        cfgList.forEach((c) => {
            if (c.tag) set.add(String(c.tag));
        });

        // 兼容：如果没有 tag，就给一组固定标签
        if (set.size === 1) {
            ['官方甄选', '流行', '摇滚', '古风', '欧美'].forEach((t) => set.add(t));
        }
        return Array.from(set);
    }, [cfgList]);

    const allPlaylists: Playlist[] = useMemo(() => {
        return cfgList.map((item) => ({
            id: `dp_all_${item.id}`,
            title: item.name,
            creator: 'HillMusic',
            coverUrl: '',
            songCount: 50,
            description: item.type === 'qq_id' ? '外部精选歌单 (QQ音乐)' : `精选全网${item.name}，实时更新`,
            apiKeyword: item.type === 'keyword' ? item.key : undefined, // 关键词搜索用
            // ✅ 利用 description 临时存储一下 QQ ID，实际逻辑中最好扩展 Playlist 类型
            // 但为了兼容现有逻辑，我们可以在点击时判断 cfgList 中的类型
        }));
    }, [cfgList]);

    const filtered = useMemo(() => {
        const kw = q.trim().toLowerCase();
        let list = allPlaylists;

        if (activeTag !== '全部') {
            list = list.filter((p) => {
                const cfg = cfgList.find((c) => `dp_all_${c.id}` === p.id);
                if (cfg?.tag) return String(cfg.tag) === activeTag;
                return p.title.includes(activeTag);
            });
        }

        if (kw) {
            list = list.filter((p) => {
                return p.title.toLowerCase().includes(kw) || (p.apiKeyword || '').toLowerCase().includes(kw);
            });
        }

        return list.slice(0, page * BATCH);
    }, [q, activeTag, allPlaylists, cfgList, page]);
    /**
     * 真实 API：拉一个歌单的“前三首封面”
     * - 先 searchMusic(keyword) 得到 songs
     * - 再对前 3 首做 fetchSongDetail()，保证 coverUrl 真实可用（修复“前三首封面不显示”）
     */
    const loadPreviewCovers = useCallback(async (playlist: Playlist) => {
        const keyword = playlist.apiKeyword || playlist.title;
        if (!keyword) return;

        // 已加载
        if (coversMap[playlist.id]?.length) return;

        // 避免并发重复
        if (loadingCoversRef.current.has(playlist.id)) return;
        loadingCoversRef.current.add(playlist.id);

        const cache = readCoversCache();
        const cached = cache[playlist.id];

        // 缓存 6 小时
        if (cached && Array.isArray(cached.covers) && cached.covers.length > 0 && Date.now() - cached.ts < 6 * 3600_000) {
            setCoversMap((prev) => ({ ...prev, [playlist.id]: cached.covers }));
            loadingCoversRef.current.delete(playlist.id);
            return;
        }

        try {
            const list = await searchMusic(keyword);
            const top3 = list.slice(0, 4);

            // 强制补详情：拿真实 cover
            const detailed: Song[] = await Promise.all(
                top3.map(async (s) => {
                    try {
                        const ds = await fetchSongDetail(s);
                        return ds || s;
                    } catch {
                        return s;
                    }
                })
            );

            const covers = detailed
                .map((s) => s.coverUrl)
                .filter(Boolean)
                .slice(0, 4);

            if (covers.length) {
                setCoversMap((prev) => ({ ...prev, [playlist.id]: covers }));
                cache[playlist.id] = { ts: Date.now(), covers };
                writeCoversCache(cache);
            }
        } catch (e) {
            // 忽略
            console.warn('loadPreviewCovers failed', e);
        } finally {
            loadingCoversRef.current.delete(playlist.id);
        }
    }, [coversMap]);

    // 观察列表变化：对当前显示的歌单“懒加载”封面
    useEffect(() => {
        filtered.forEach((p) => loadPreviewCovers(p));
    }, [filtered, loadPreviewCovers]);

    // 无限滚动：IntersectionObserver
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;

        const obs = new IntersectionObserver(
            (entries) => {
                const e = entries[0];
                if (e.isIntersecting) {
                    setPage((p) => p + 1);
                }
            },
            { root: null, rootMargin: '120px', threshold: 0.01 }
        );

        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // 当筛选变化：重置分页
    useEffect(() => {
        setPage(1);
    }, [q, activeTag]);

    /**
     * 收藏/取消收藏（歌单广场）
     */
    const toggleFav = (playlist: Playlist) => {
        const next = new Set(favSet);
        if (next.has(playlist.id)) {
            next.delete(playlist.id);
            toast('已取消收藏');
        } else {
            next.add(playlist.id);
            toast('已收藏歌单');
        }
        setFavSet(next);
        writeFavSet(next);
    };

    /**
     * 加入播放队列（取该歌单搜索结果前 30 首）
     */
    const addPlaylistToQueue = async (playlist: Playlist) => {
        const keyword = playlist.apiKeyword || playlist.title;
        if (!keyword) return;

        try {
            toast('正在加入播放队列...');
            const list = await searchMusic(keyword);
            const top = list.slice(0, 60);

            // 只给第一首补详情（让队列立刻可播），其余懒加载即可
            const first = top[0] ? await fetchSongDetail(top[0]) : null;
            const merged = first ? [first, ...top.slice(1)] : top;

            player.addAllToQueue(merged);
            toast(`已加入队列：${playlist.title}`);
        } catch (e) {
            console.error(e);
            toast('加入队列失败');
        }
    };

    const onScrollCloseSwipe = useMemo(() => throttle(() => setOpenSwipeKey(null), 200), []);

    /**
      * ✅ 新增：处理歌单点击
      * 如果是 ID 类型，先拉取详情再跳转；如果是 Keyword 类型，直接跳转(现有逻辑)
      */
    const handlePlaylistClick = async (playlist: Playlist) => {
        const cfg = cfgList.find(c => `dp_all_${c.id}` === playlist.id);

        // 1. 如果是 QQ ID 类型
        if (cfg && cfg.type === 'qq_id') {
            try {
                setImporting(true);
                toast('正在获取歌单详情...');
                const qqPlaylist = await fetchQQPlaylist(cfg.key);
                if (qqPlaylist) {
                    onNavigatePlaylist(qqPlaylist);
                } else {
                    toast('获取歌单失败，请重试');
                }
            } finally {
                setImporting(false);
            }
            return;
        }

        // 2. 原有逻辑：动态关键词歌单
        onNavigatePlaylist(playlist);
    };

    /**
     * ✅ 新增：处理搜索/导入 ID
     */
    const handleSearchOrImport = async () => {
        const input = q.trim();
        if (!input) return;

        // 如果是纯数字且长度大于8，判定为歌单 ID
        if (/^\d{8,}$/.test(input)) {
            try {
                setImporting(true);
                toast(`正在导入歌单 ID: ${input}`);
                const pl = await fetchQQPlaylist(input);
                if (pl) {
                    toast('导入成功');
                    onNavigatePlaylist(pl);
                    setQ(''); // 清空搜索框
                } else {
                    toast('未找到该歌单或网络受限');
                }
            } catch (e) {
                toast('导入出错');
            } finally {
                setImporting(false);
            }
        } else {
            // 普通搜索，无需操作，已通过 filtered 自动过滤
        }
    };


    return (
        <div className="h-full overflow-y-auto no-scrollbar  bg-slate-900  pb-10 animate-in slide-in-from-right duration-300 transition-colors" onScroll={onScrollCloseSwipe}>
            <div className="sticky top-0 z-30  bg-slate-900 /92 backdrop-blur-md border-b border-white/5">
                <div className="p-4 flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft size={22} className="text-white" /></button>
                    <div className="flex-1"><h1 className="text-lg font-bold text-white leading-tight">歌单广场</h1></div>
                    {importing && <Loader2 size={20} className="text-indigo-500 animate-spin" />}
                </div>
                <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 bg-[#0f172a]/60 border border-white/5 rounded-2xl px-3 py-2">
                        <Search size={16} className="text-slate-400" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchOrImport()} placeholder="搜索歌单 / 输入QQ歌单ID导入" className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-400" />
                        {/^\d{8,}$/.test(q) ? (
                            <button onClick={handleSearchOrImport} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium flex items-center gap-1 hover:bg-indigo-500"><Import size={12} /> 导入</button>
                        ) : q ? (
                            <button onClick={() => setQ('')} className="text-xs px-2 py-1 rounded-lg  bg-white/10 text-slate-300">清空</button>
                        ) : null}
                    </div>
                </div>
                <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {tags.map((tag) => {
                        const active = tag === activeTag;
                        return (
                            <button key={tag} onClick={() => setActiveTag(tag)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? 'bg-indigo-600 text-white shadow' : ' bg-[#0f172a]/70 text-slate-400 hover:text-white'}`}>{tag}</button>
                        );
                    })}
                </div>
            </div>

            <div className="px-4 pt-4 pb-8">
                <div className="grid grid-cols-1 gap-3">
                    {filtered.map((playlist, idx) => {
                        const gradient = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
                        const isFav = favSet.has(playlist.id);
                        const previewCovers = coversMap[playlist.id] || [];
                        const swipeKey = playlist.id;
                        const isQQ = playlist.source === 'qq';

                        const left = (
                            <div onClick={() => handlePlaylistClick(playlist)} className={`relative h-27 ${gradient} rounded-2xl p-3 overflow-hidden cursor-pointer shadow-lg active:scale-[0.99] transition-transform`}>
                                <div className="absolute -right-3 -bottom-3 w-[86px] h-[86px] rotate-12 opacity-95">
                                    <MosaicCover covers={previewCovers} fallback={isQQ ? 'https://y.gtimg.cn/mediastyle/global/img/cover_like.png' : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80'} className="w-full h-full" />
                                    <div className="absolute inset-0 bg-black/15 mix-blend-multiply rounded-2xl" />
                                </div>
                                <div className="relative z-10 h-full flex flex-col justify-between pr-16">
                                    <div>
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[10px] font-bold tracking-wider opacity-60 uppercase text-black/40 block">Playlist</span>
                                            {/* ✅ 歌单广场显示导入标签 */}
                                            {isQQ && <span className="bg-black/20 px-1.5 py-0.5 rounded text-[8px] text-white/90 flex items-center gap-0.5 backdrop-blur-sm"><Globe size={8} /> 导入</span>}
                                        </div>
                                        <h3 className="text-[15px] font-bold text-white leading-tight drop-shadow-sm line-clamp-2">{playlist.title}</h3>
                                        <p className="text-[10px] text-white/85 font-medium leading-snug line-clamp-1 mt-1">{playlist.description}</p>
                                    </div>
                                </div>
                            </div>
                        );

                        const rightActions = (
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); toggleFav(playlist); setOpenSwipeKey(null); }} className={`w-16 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-bold border border-white/10 ${isFav ? 'bg-red-500/80 text-white' : 'bg-[#0f172a]/90 text-slate-200 hover:bg-[#0f172a]'}`}>
                                    <Heart size={16} className={isFav ? 'fill-current' : ''} /><span className="text-[10px] mt-0.5">{isFav ? '取消' : '收藏'}</span>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); addPlaylistToQueue(playlist); setOpenSwipeKey(null); }} className="w-16 h-12 rounded-xl bg-indigo-600 text-white flex flex-col items-center justify-center text-xs font-bold border border-white/10 hover:bg-indigo-500">
                                    <ListPlus size={16} /><span className="text-[10px] mt-0.5">队列</span>
                                </button>
                            </div>
                        );
                        return <SwipeRow key={playlist.id} rowKey={swipeKey} openKey={openSwipeKey} setOpenKey={setOpenSwipeKey} left={left} rightActions={rightActions} />;
                    })}
                </div>
                <div ref={sentinelRef} className="h-14 flex items-center justify-center"><span className="text-xs text-slate-500">继续下滑加载更多…</span></div>
                {filtered.length === 0 && <div className="py-16 text-center text-slate-500"><div className="text-white font-bold mb-2">没有找到匹配歌单</div><div className="text-xs">输入纯数字ID可导入QQ歌单</div></div>}
            </div>
        </div>
    );
};
export default SeeAllPlaylists;
