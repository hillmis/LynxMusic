import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, PlayCircle, Loader2, PlusCircle } from 'lucide-react';
import { Song } from '../types';
import { SongItem } from '../components/SongItem';
import { getDynamicPlaylist, fetchSongDetail } from '../utils/api';

interface SeeAllSongsProps {
    onBack: () => void;
    onPlaySong: (song: Song) => void;
    currentSong: Song | null;
    onAddToQueue: (song: Song) => void;      // ✅ 需要传给 SongItem
    onAddAllToQueue: (songs: Song[]) => void; // ✅ 修复：新增此 Prop
}

const SeeAllSongs: React.FC<SeeAllSongsProps> = ({
    onBack,
    onPlaySong,
    currentSong,
    onAddToQueue,
    onAddAllToQueue // ✅ 解构
}) => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        const load = async () => {
            setLoading(true);
            const basicList = await getDynamicPlaylist('热门');
            if (isMountedRef.current) {
                setSongs(basicList);
                setLoading(false);
            }
        };
        load();
        return () => { isMountedRef.current = false; };
    }, []);

    return (
        <div className="h-full overflow-y-auto no-scrollbar  bg-slate-900  pb-10 animate-in slide-in-from-right duration-300">
            <div className="sticky top-0 z-10  bg-slate-900 /95 backdrop-blur-md p-4 flex items-center gap-4 border-b border-white/5 shadow-sm">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-white" />
                </button>
                <h1 className="text-lg font-bold text-white">每日推荐</h1>
            </div>

            <div className="p-4">
                <div className="flex gap-3 mb-6">
                    <div
                        className="flex-1 bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:bg-indigo-600/20 transition-colors active:scale-[0.98]"
                        onClick={() => songs.length > 0 && onPlaySong(songs[0])}
                    >
                        <div className="flex items-center gap-3">
                            <PlayCircle className="text-indigo-400" size={24} />
                            <div>
                                <h3 className="text-indigo-100 font-bold text-sm">播放全部</h3>
                                <p className="mt-1 text-indigo-400/60 text-xs">{loading ? '加载中...' : `${songs.length} 首歌曲`}</p>
                            </div>
                        </div>
                    </div>

                    <div
                        className="flex-1 bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:bg-indigo-600/20 transition-colors active:scale-[0.98]"
                        onClick={() => songs.length > 0 && onAddAllToQueue(songs)}
                    >
                        <div className="flex items-center gap-3">
                            <PlusCircle className="text-indigo-400" size={24} />
                            <div>
                                <h3 className="text-indigo-100 font-bold text-sm">全部添加到</h3>
                                <p className="mt-1 text-indigo-400/60 text-xs">播放队列</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-1">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : (
                        songs.map((song, idx) => (
                            <SongItem
                                key={song.id}
                                index={idx}
                                song={song}
                                onClick={() => onPlaySong(song)}
                                onPlaySong={onPlaySong} // SongItem 需要这个
                                onAddToQueue={onAddToQueue} // SongItem 需要这个
                                isActive={currentSong?.id === song.id}

                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeeAllSongs;
