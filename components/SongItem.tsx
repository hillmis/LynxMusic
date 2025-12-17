
import React, { useState } from 'react';
import { Song } from '../types';
import { Play, MoreVertical } from 'lucide-react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useSongActions } from '../hooks/useSongActions';
import SongActionSheet from '../components/SongActionSheet';

export interface SongItemProps {
  song: Song;
  index: number;
  onClick?: () => void;
  isActive: boolean;
  showCover?: boolean;
  showIndex?: boolean;
  onAddToQueue?: (song: Song) => void;
  onPlaySong?: (song: Song) => void;
  showMoreButton?: boolean;
  showAddButton?: boolean;
}

export const SongItem: React.FC<SongItemProps> = ({
  song,
  index,
  onClick,
  isActive,
  showCover = false,
  showIndex = true,
  onAddToQueue,
  onPlaySong,
  showMoreButton = true,
}) => {
  const player = useAudioPlayer();
  const songActions = useSongActions();
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const handleClick = () => {
    if (onClick) onClick();
    else if (onPlaySong) onPlaySong(song);
    else player.playSong(song);
  };

  const quality = song.quality || 'SQ';
  const isSQ = quality === 'SQ' || quality === 'HR';

  return (
    <>
      <div
        onClick={handleClick}
        className={`flex items-center p-3 mb-1 rounded-xl transition-all cursor-pointer group active:scale-[0.99]
          ${isActive
            ? 'bg-indigo-500/10 border border-indigo-500/20'
            : 'hover:bg-slate-800/50 border border-transparent'
          }
        `}
      >
        {showIndex && (
          <div className="w-8 text-center text-slate-500 text-sm font-medium mr-1 flex-shrink-0 font-din">
            {isActive ? (
              <Play size={14} className=" text-indigo-500 fill-current mx-auto animate-pulse" />
            ) : (
              index + 1
            )}
          </div>
        )}

        {showCover && (
          <div className="relative w-10 h-10 mr-3 flex-shrink-0">
            <img
              src={song.coverUrl}
              alt={song.title}
              className="w-full h-full rounded-lg object-cover shadow-sm bg-slate-800"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className={`text-sm font-bold truncate ${isActive ? ' text-indigo-400' : 'text-slate-200'}`}>
            {song.title}
          </h3>
          <div className="flex items-center mt-0.5 overflow-hidden">
            <span className={`text-[9px] font-bold px-1 rounded border mr-1.5 flex-shrink-0 ${isSQ
              ? 'text-yellow-500 border-yellow-500/50'
              : 'text-indigo-400 border-indigo-400/50'
              }`}>
              {quality}
            </span>
            <p className="text-xs text-slate-500 truncate flex-1">
              {song.artist}
            </p>
          </div>
        </div>

        {showMoreButton && (
          <button
            onClick={(e) => { e.stopPropagation(); setActionSong(song); setActionOpen(true); }}
            className="p-2 text-slate-400 hover: hover:text-white rounded-full hover:bg-white/10"
          >
            <MoreVertical size={16} />
          </button>
        )}
      </div>

      <SongActionSheet
        song={actionSong}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onAddToFavorites={songActions.handleAddToFavorites}
        onAddToQueue={songActions.handleAddToQueue}
        onAddToPlaylist={songActions.handleAddToPlaylist}
        onCreatePlaylistAndAdd={songActions.handleCreatePlaylistAndAdd}
        onDownloadMusic={(s) => songActions.handleDownload(s, 'music')}

        // ✅ 触发全局事件，跳转播放页并播放 MV
        onPlayMv={(s) => window.dispatchEvent(new CustomEvent('hm-play-mv', { detail: s }))}
      />
    </>
  );
};
export default SongItem;
