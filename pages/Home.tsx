import React, { useState, useEffect, useRef } from 'react';
import { Song, Playlist } from '../types';
import { getDynamicPlaylist, fetchSongDetail } from '../utils/api';
import { DYNAMIC_PLAYLIST_CONFIG } from '../constants';
import {
  Play,
  ChevronRight,
  Calendar,
  Grid,
  Loader2
} from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

/* =========================
 * 样式常量
 * ========================= */

const CARD_STYLES = [
  'bg-gradient-to-br from-yellow-500 to-orange-600',
  'bg-gradient-to-br from-stone-500 to-stone-700',
  'bg-gradient-to-br from-amber-700 to-amber-900',
  'bg-gradient-to-br from-slate-600 to-slate-800',
  'bg-gradient-to-br from-red-700 to-red-900',
  'bg-gradient-to-br from-orange-400 to-red-500'
];

const BANNERS = [
  {
    id: 1,
    image: 'https://s3.bmp.ovh/imgs/2025/12/22/955e5e627e249fa9.jpg',
    tag: '官方频道',
    title: '点击加入 LynxMusic 官方频道',
    link: 'https://pd.qq.com/s/b7dkkep8x?b=9'
  },
  {
    id: 2,
    image: 'https://s3.bmp.ovh/imgs/2025/12/19/04e1ee0322afee7e.png',
    tag: 'GitHub',
    title: '点击访问 hillmis的GitHub首页',
    link: 'https://github.com/hillmis'
  },
  {
    id: 3,
    image: 'https://s3.bmp.ovh/imgs/2025/07/23/b3d86fed8117d483.jpg',
    tag: '编辑精选',
    title: '用眼睛看，用心灵听',
    link: 'https://link3.cc/liu13'
  }
];

/* =========================
 * Props
 * ========================= */

interface HomeProps {
  onPlaySong: (song: Song) => void;
  onNavigateCheckIn: () => void;
  onNavigatePlaylist: (playlist: Playlist) => void;
  onNavigateSeeAllSongs: () => void;
  onNavigateSeeAllPlaylists: () => void;
}

/* =========================
 * Home
 * ========================= */

const Home: React.FC<HomeProps> = ({
  onPlaySong,
  onNavigateCheckIn,
  onNavigatePlaylist,
  onNavigateSeeAllPlaylists
}) => {
  // 修改状态结构，分开存储 emoji 和 文本
  const [greeting, setGreeting] = useState({ text: '', emoji: '' });
  const [recSongs, setRecSongs] = useState<Song[]>([]);
  const [dailyPlaylist, setDailyPlaylist] = useState<Playlist | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);

  const isMountedRef = useRef(true);

  /* =========================
   * 每日推荐（修复点）
   * ========================= */

  const loadDailyRecommend = async () => {
    const cacheKey = 'hm_daily_recommend_v1';
    const cacheTTL = 60 * 60 * 1000; // 1 小时

    const applyCache = (data: Song[]) => {
      setRecSongs(data);
      if (data.length > 0) {
        const pl: Playlist = {
          id: 'daily_recommend',
          title: '每日推荐',
          creator: 'LynxMusic',
          coverUrl: data[0]?.coverUrl || '',
          songCount: 30,
          songs: data,
          description: '每日自动生成的推荐歌单',
          apiKeyword: '热门',
          isLocal: false,
          source: 'qq'
        };
        setDailyPlaylist(pl);
      }
    };

    const fillDetails = (list: Song[]) => {
      list.forEach(async (song, index) => {
        try {
          const detail = await fetchSongDetail(song);
          if (!isMountedRef.current) return;
          setRecSongs(prev => {
            const next = [...prev];
            if (next[index] && next[index].id === song.id) {
              next[index] = { ...next[index], ...detail };
            }
            setDailyPlaylist(pl => pl ? { ...pl, songs: next, songCount: next.length, coverUrl: next[0]?.coverUrl || pl.coverUrl } : pl);
            return next;
          });
        } catch { }
      });
    };

    let cachedData: Song[] | null = null;
    try {
      const cacheRaw = sessionStorage.getItem(cacheKey);
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw);
        if (Array.isArray(cache.data)) {
          cachedData = cache.data;
          applyCache(cache.data);
          if (Date.now() - cache.ts < cacheTTL) {
            fillDetails(cache.data);
            return;
          }
        }
      }
    } catch { }

    try {
      setLoading(true);

      const songs = await getDynamicPlaylist('热门');
      const top10 = songs.slice(0, 10);

      if (isMountedRef.current) {
        applyCache(top10);
      }

      fillDetails(top10);

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: top10 }));
      } catch { }
    } catch (e) {
      console.error('每日推荐加载失败', e);
      if (cachedData?.length) {
        applyCache(cachedData);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };


  /* =========================
   * 初始化
   * ========================= */

  useEffect(() => {
    isMountedRef.current = true;

    const hour = new Date().getHours();
    let text = '';
    let emoji = '';

    // 修复了原本逻辑顺序问题，并分离了 Emoji
    if (hour < 6) {
      emoji = '🌙'; 
      text = '夜深了~';
    } else if (hour < 11) { 
      emoji = '☀️'; 
      text = '早上好！';
    } else if (hour < 13) { 
      emoji = '🌞'; 
      text = '中午好！';
    } else if (hour < 18) { 
      emoji = '🌇'; 
      text = '下午好！';
    } else { 
      emoji = '✨'; 
      text = '晚上好！';
    }
    
    setGreeting({ text, emoji });

    const initPlaylists: Playlist[] = DYNAMIC_PLAYLIST_CONFIG.map(item => ({
      id: `dp_${item.id}`,
      title: item.name,
      creator: 'LynxMusic',
      coverUrl: '',
      coverImgStack: [],
      songCount: 50,
      description: `精选全网${item.name}，实时更新`,
      apiKeyword: item.key
    }));

    setPlaylists(initPlaylists);

    loadDailyRecommend();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* =========================
   * UI
   * ========================= */

  const openBannerLink = (link?: string) => {
    if (!link) return;
    const url = link.startsWith('http') ? link : `https://${link}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32 bg-[#121212] transition-colors">
      {/* Header */}
      <div className="p-6 pt-8 flex justify-between items-center">
        <div>
          {/* 修改后的标题结构：使用 flex 布局，将 Emoji 和 渐变文字分开 */}
          <h1 className="text-2xl font-black flex items-center gap-2">
            {/* Emoji 部分：保持原色，不加 transparent */}
            <span className="text-2xl filter drop-shadow-sm">
              {greeting.emoji}
            </span>
            {/* 文字部分：应用渐变色 */}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              {greeting.text}
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">LynxMusic 祝您天天开心</p>
        </div>
        <button
          onClick={onNavigateCheckIn}
          className="p-2.5 bg-[#121212] rounded-full text-slate-400 border border-white/5 shadow-sm">
          <Calendar size={24} />
        </button>
      </div>

      {/* Banner */}
      <div className="px-6 mb-6 relative h-40">
        <Swiper
          modules={[Autoplay, Pagination]}
          slidesPerView={1}
          loop
          autoplay={{ delay: 4000, disableOnInteraction: false }}
          pagination={{
            clickable: true,
            renderBullet: function (index, className) {
              return `<span class="${className}" style="background-color: ${index ? '#9CA3AF' : 'rgba(255,255,255,0.5)'}; width: 5px; height: 5px; margin: 0 4px;"></span>`;
            }
          }}
          className="w-full h-full rounded-2xl"
        >
          {BANNERS.map(banner => (
            <SwiperSlide key={banner.id}>
              <div
                className="relative w-full h-full cursor-pointer"
                onClick={() => openBannerLink(banner.link || banner.image)}
              >
                <img src={banner.image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-4 flex flex-col justify-end">
                  <span className="text-[10px] font-bold text-indigo-400">
                    {banner.tag}
                  </span>
                  <h2 className="text-[15px] font-bold text-white mb-2">
                    {banner.title}
                  </h2>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* 每日推荐 */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-6 mb-3">
          <h2 className="text-base font-bold text-slate-800 text-white">每日推荐</h2>
          <button
            onClick={() => dailyPlaylist && onNavigatePlaylist(dailyPlaylist)}
            className="text-[10px] text-indigo-400 flex items-center"
            disabled={!dailyPlaylist}
          >
            查看全部 <ChevronRight size={12} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="flex overflow-x-auto no-scrollbar px-6 gap-3">
            {recSongs.map(song => (
              <div
                key={song.id}
                onClick={() => onPlaySong(song)}
                className="w-28 flex-shrink-0 cursor-pointer"
              >
                <div className="relative w-28 h-28 mb-1.5 rounded-lg overflow-hidden shadow-md bg-[#121212]">
                  <img src={song.coverUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center">
                    <Play className="text-white fill-white" />
                  </div>
                </div>
                <div className="text-xs font-bold text-white truncate">{song.title}</div>
                <div className="text-[10px] text-slate-400 truncate">{song.artist}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 甄选歌单 */}
      <div className="px-6 mb-8">
        <h2 className="text-base font-bold text-white mb-3">甄选歌单</h2>

        <div className="grid grid-cols-2 gap-3">
          {playlists.slice(0, 6).map((playlist, idx) => {
            const bg = CARD_STYLES[idx % CARD_STYLES.length];

            return (
              <div
                key={playlist.id}
                onClick={() => onNavigatePlaylist(playlist)}
                className={`relative h-24 ${bg} rounded-2xl p-2.5 overflow-hidden cursor-pointer border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.25)]`}
              >
                <div className="absolute inset-0 bg-white/10 backdrop-blur-[6px] border border-white/10" />
                <div className="relative z-10 pr-8 space-y-1.5">
                  <h3 className="text-sm font-bold text-white line-clamp-2 leading-relaxed">
                    {playlist.title}
                  </h3>
                  <p className="mt-2 text-[9px] text-white/80 line-clamp-2">
                    {playlist.description}
                  </p>
                </div>
                <div className="absolute right-[-20px] bottom-[-40px] w-[140%] text-white/15 text-6xl font-serif italic rotate-[-25deg] select-none pointer-events-none text-right">
                  甄
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onNavigateSeeAllPlaylists}
          className="w-full mt-4 py-3 rounded-xl bg-[#121212] text-slate-300 font-bold text-sm shadow-sm border border-white/5 flex items-center justify-center gap-2"
        >
          <Grid size={16} /> 更多歌单 <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default Home;