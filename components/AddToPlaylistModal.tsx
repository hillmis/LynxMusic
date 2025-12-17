import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, ListMusic, Heart, Check } from 'lucide-react';
import { Song, Playlist } from '../types';
import { getUserPlaylists, addSongToPlaylist, createUserPlaylist } from '../utils/playlistStore';

type Props = {
    songs: Song[]; // 支持批量
    open: boolean;
    onClose: () => void;
};

const FAVORITE_TITLE = '我喜欢';

const AddToPlaylistModal: React.FC<Props> = ({ songs, open, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [newName, setNewName] = useState('');

    // 加载歌单列表，并将“我喜欢”置顶
    const sortedPlaylists = useMemo(() => {
        const fav = playlists.find(p => p.title === FAVORITE_TITLE);
        const rest = playlists.filter(p => p.title !== FAVORITE_TITLE);
        return fav ? [fav, ...rest] : rest;
    }, [playlists]);

    const load = async () => {
        setLoading(true);
        try {
            const list = await getUserPlaylists();
            setPlaylists(list);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            load();
            setNewName('');
        }
    }, [open]);

    const handleAdd = async (playlistId: string) => {
        if (songs.length === 0) return;
        setLoading(true);
        try {
            let successCount = 0;
            for (const song of songs) {
                const ok = await addSongToPlaylist(playlistId, song);
                if (ok) successCount++;
            }
            window.webapp?.toast(`成功添加 ${successCount} 首歌曲`);
            onClose();
        } catch (e) {
            console.error(e);
            window.webapp?.toast('添加失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAndAdd = async () => {
        const name = newName.trim();
        if (!name) return;
        if (songs.length === 0) return;

        setLoading(true);
        try {
            const pl = await createUserPlaylist(name);
            let successCount = 0;
            for (const song of songs) {
                await addSongToPlaylist(pl.id, song);
                successCount++;
            }
            window.webapp?.toast(`已创建歌单并添加 ${successCount} 首歌曲`);
            onClose();
        } catch (e) {
            console.error(e);
            window.webapp?.toast('创建失败');
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full  bg-[#0f172a] rounded-t-3xl border-t border-white/10 shadow-2xl p-5 pb-8 animate-in slide-in-from-bottom duration-300">

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-white font-bold text-base">添加到歌单</h3>
                        <p className="text-slate-500 text-xs mt-0.5">
                            即将添加 <span className="text-indigo-400 font-bold">{songs.length}</span> 首歌曲
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Create New */}
                <div className="flex gap-2 mb-4">
                    <div className="flex-1 bg-[#0f172a] rounded-xl border border-white/5 px-3 py-2.5">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="新建歌单名称..."
                            className="w-full bg-transparent text-white text-sm outline-none placeholder-slate-500"
                            disabled={loading}
                        />
                    </div>
                    <button
                        onClick={handleCreateAndAdd}
                        disabled={loading || !newName.trim()}
                        className="px-4 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1"
                    >
                        <Plus size={16} /> 新建
                    </button>
                </div>

                {/* Playlist List */}
                <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2">
                    {sortedPlaylists.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-xs">
                            暂无歌单，请先新建
                        </div>
                    )}
                    {sortedPlaylists.map(pl => {
                        const isFav = pl.title === FAVORITE_TITLE;
                        return (
                            <button
                                key={pl.id}
                                onClick={() => handleAdd(pl.id)}
                                className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-[#0f172a]/40 hover:bg-white/5 border border-white/5 transition-colors active:scale-[0.99] group"
                            >
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isFav ? 'bg-red-500/15 text-red-400' : 'bg-indigo-500/15 text-indigo-300'}`}>
                                    {isFav ? <Heart size={20} className={isFav ? "fill-current" : ""} /> : <ListMusic size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{pl.title}</p>
                                    <p className="text-slate-500 text-xs mt-0.5">{pl.songCount || 0} 首</p>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Check size={16} className="text-indigo-400" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AddToPlaylistModal;