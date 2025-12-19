
import React, { useEffect, useMemo, useState } from 'react';
import { X, Heart, ListPlus, ListMusic, Download, Check, Plus, PlayCircle } from 'lucide-react';
import { Playlist, Song } from '../types';
import { getUserPlaylists, isSongInFavorites } from '../utils/playlistStore';

interface Props {
    open: boolean;
    onClose: () => void;
    song: Song | null;

    onAddToFavorites?: (song: Song) => Promise<boolean> | boolean | void;
    onAddToQueue?: (song: Song) => void;
    onAddToPlaylist?: (playlistId: string, song: Song) => void;
    onCreatePlaylistAndAdd?: (title: string, song: Song) => Promise<any> | any;

    onDownloadMusic?: (song: Song) => void;

    // ✅ 重命名为 onPlayMv，明确其功能是播放 MV
    onPlayMv?: (song: Song) => void;
}

export default function SongActionSheet({
    open,
    onClose,
    song,
    onAddToFavorites,
    onAddToQueue,
    onAddToPlaylist,
    onCreatePlaylistAndAdd,
    onDownloadMusic,
    onPlayMv // ✅
}: Props) {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [isFavorite, setIsFavorite] = useState(false);

    useEffect(() => {
        if (open) {
            getUserPlaylists().then(setPlaylists);
            setCreating(false);
            setNewTitle('');
            if (song?.id) {
                isSongInFavorites(song.id).then(setIsFavorite);
            } else {
                setIsFavorite(false);
            }
        }
    }, [open]);

    const userPlaylists = useMemo(
        () => playlists.filter(p => !p.apiKeyword && p.title !== '我喜欢'),
        [playlists]
    );

    if (!open || !song) return null;

    const handleAction = (action?: (s: Song) => any) => {
        if (typeof action === 'function') {
            action(song);
        }
        onClose();
    };

    const handleFavoriteClick = async () => {
        if (onAddToFavorites && song) {
            const res = await onAddToFavorites(song);
            if (typeof res === 'boolean') setIsFavorite(res);
        }
        onClose();
    };

    const isSongInPlaylist = (playlist: Playlist) => {
        return playlist.songs?.some(s => s.id === song.id);
    };

    return (
        <div className="fixed inset-0 z-[9999] swiper-no-swiping ">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="absolute left-0 right-0 bottom-0  bg-slate-900  rounded-t-3xl border-tborder-white/10 p-5 animate-in slide-in-from-bottom-10 duration-200 safe-area-bottom max-h-[80vh] flex flex-col shadow-2xl">

                {/* 头部信息 */}
                <div className="flex items-center justify-between mb-6 flex-shrink-0">
                    <div className="flex gap-3 overflow-hidden">
                        <img src={song.coverUrl} className="w-12 h-12 rounded-lg bg-slate-800 object-cover flex-shrink-0" />
                        <div className="min-w-0 flex flex-col justify-center">
                            <div className="text-white font-bold truncate text-base">{song.title}</div>
                            <div className="text-slate-500 text-xs truncate">{song.artist}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <X className="text-slate-400" size={20} />
                    </button>
                </div>

                {/* 快捷操作网格 */}
                <div className="grid grid-cols-4 gap-2 mb-6 flex-shrink-0">
                    <button onClick={() => handleAction(onAddToQueue)} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 active:scale-95 transition-all">
                        <ListMusic size={22} className=" text-indigo-400" />
                        <span className="text-[10px]  text-slate-300">下一首</span>
                    </button>
                    <button
                        onClick={handleFavoriteClick}
                        className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 active:scale-95 transition-all"
                    >
                        <Heart size={22} className={isFavorite ? 'text-red-500 fill-red-500' : 'text-red-400'} />
                        <span className="text-[10px]  text-slate-300">{isFavorite ? '已喜欢' : '喜欢'}</span>
                    </button>
                    <button onClick={() => handleAction(onDownloadMusic)} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 active:scale-95 transition-all">
                        <Download size={22} className="text-emerald-400" />
                        <span className="text-[10px]  text-slate-300">下载</span>
                    </button>

                    {/* ✅ MV 播放按钮 */}
                    <button onClick={() => handleAction(onPlayMv)} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 active:scale-95 transition-all">
                        <PlayCircle size={22} className="text-purple-400" />
                        <span className="text-[10px]  text-slate-300">播放MV</span>
                    </button>
                </div>

                {/* 添加到歌单列表标题 */}
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <div className="text-white font-bold text-sm">添加到歌单</div>
                    <button
                        onClick={() => setCreating(v => !v)}
                        className="text-xs px-3 py-1.5 rounded-full bg-slate-800  text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1"
                    >
                        <ListPlus size={14} />
                        新建
                    </button>
                </div>

                {/* 新建歌单输入框 */}
                {creating && (
                    <div className="mb-4 flex gap-2 flex-shrink-0">
                        <input
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="输入新歌单名称"
                            className="flex-1 bg-slate-800 text-white px-4 py-2 rounded-xl outline-none border border-transparent focus:border-indigo-500 text-sm"
                            autoFocus
                        />
                        <button
                            onClick={async () => {
                                if (!newTitle.trim()) return;
                                if (onCreatePlaylistAndAdd) {
                                    await onCreatePlaylistAndAdd(newTitle.trim(), song);
                                }
                                onClose();
                            }}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500"
                        >
                            创建
                        </button>
                    </div>
                )}

                {/* 歌单列表 (滚动区域) */}
                <div className="overflow-y-auto no-scrollbar space-y-1 flex-1 min-h-[150px]">
                    {userPlaylists.length > 0 ? userPlaylists.map(pl => {
                        const added = isSongInPlaylist(pl);
                        return (
                            <button
                                key={pl.id}
                                onClick={() => {
                                    if (onAddToPlaylist) {
                                        onAddToPlaylist(pl.id, song);
                                    }
                                    onClose();
                                }}
                                className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-white/5 text-left group transition-colors active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                                        <ListMusic size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-slate-100 text-sm font-medium truncate pr-2">
                                            {pl.title}
                                        </div>
                                        <div className="text-slate-500 text-xs">{pl.songCount || 0} 首</div>
                                    </div>
                                </div>

                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                                    {added ? (
                                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                            <Check size={14} className="text-green-500" />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-white/20 group-hover:text-white group-hover:border-white/30 transition-colors">
                                            <Plus size={14} />
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    }) : (
                        <div className="py-8 text-center text-slate-400 text-xs">
                            暂无自建歌单，点击上方“新建”创建
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
