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
 * 封面缓存（歌单三图）
 * ========================= */

const COVER_CACHE_KEY = 'hm_home_playlist_covers_v1';

type CoverCache = Record<
  string,
  {
    covers: string[];
    ts: number;
  }
>;

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小时

const readCoverCache = (): CoverCache => {
  try {
    return JSON.parse(sessionStorage.getItem(COVER_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCoverCache = (cache: CoverCache) => {
  try {
    sessionStorage.setItem(COVER_CACHE_KEY, JSON.stringify(cache));
  } catch { }
};

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
  { id: 1, image: 'https://picsum.photos/seed/hm_banner_101/800/400', tag: '最新发布', title: '2024 夏日氛围感' },
  { id: 2, image: 'https://picsum.photos/seed/hm_banner_102/800/400', tag: '独家首发', title: '爵士慵懒之夜' },
  { id: 3, image: 'https://picsum.photos/seed/hm_banner_103/800/400', tag: '编辑精选', title: '赛博朋克：电子幻梦' }
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
  const [greeting, setGreeting] = useState('');
  const [recSongs, setRecSongs] = useState<Song[]>([]);
   const [dailyPlaylist, setDailyPlaylist] = useState<Playlist | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);

  const isMountedRef = useRef(true);
  const loadingCoverSet = useRef<Set<string>>(new Set());

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
          creator: 'HillMusic',
          coverUrl: data[0]?.coverUrl || '',
          songCount:30,
          songs: data,
          description: '每日自动生成的推荐歌单',
          isLocal: false,
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
          // 命中缓存也可以补全封面
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
      // 失败时回退到缓存数据
      if (cachedData?.length) {
        applyCache(cachedData);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  /* =========================
   * 歌单三图封面（真实 API）
   * ========================= */

  const loadPlaylistCovers = async (pl: Playlist) => {
    if (!pl.apiKeyword) return;
    if (loadingCoverSet.current.has(pl.id)) return;

    loadingCoverSet.current.add(pl.id);

    const cache = readCoverCache();
    const cached = cache[pl.id];

    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setPlaylists(prev =>
        prev.map(p => (p.id === pl.id ? { ...p, coverImgStack: cached.covers } : p))
      );
      loadingCoverSet.current.delete(pl.id);
      return;
    }

    try {
      const songs = await getDynamicPlaylist(pl.apiKeyword);
      const top3 = songs.slice(0, 3);

      const detailed = await Promise.all(
        top3.map(s => fetchSongDetail(s).catch(() => s))
      );

      const covers = detailed.map(s => s.coverUrl).filter(Boolean).slice(0, 3);

      if (covers.length && isMountedRef.current) {
        setPlaylists(prev =>
          prev.map(p => (p.id === pl.id ? { ...p, coverImgStack: covers } : p))
        );

        cache[pl.id] = { covers, ts: Date.now() };
        writeCoverCache(cache);
      }
    } catch (e) {
      console.warn('获取歌单封面失败', e);
    } finally {
      loadingCoverSet.current.delete(pl.id);
    }
  };

  /* =========================
   * 初始化
   * ========================= */

  useEffect(() => {
    isMountedRef.current = true;

    const hour = new Date().getHours();
    if (hour < 6) setGreeting('夜深了~');
    else if (hour < 11) setGreeting('早上好！');
    else if (hour < 14) setGreeting('中午好！');
    else if (hour < 18) setGreeting('下午好！');
    else setGreeting('晚上好！');

    const initPlaylists: Playlist[] = DYNAMIC_PLAYLIST_CONFIG.map(item => ({
      id: `dp_${item.id}`,
      title: item.name,
      creator: 'HillMusic',
      coverUrl: '',
      coverImgStack: [],
      songCount: 50,
      description: `精选全网${item.name}，实时更新`,
      apiKeyword: item.key
    }));

    setPlaylists(initPlaylists);

    // 后台加载歌单封面（有缓存则直接使用，TTL 由 loadPlaylistCovers 控制）
    initPlaylists.slice(0, 6).forEach(loadPlaylistCovers);

    // ✅ 关键：加载每日推荐（首屏/刷新触发一次，之后命中缓存）
    loadDailyRecommend();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* =========================
   * UI
   * ========================= */

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32 bg-[#0f172a] transition-colors">
      {/* Header */}
      <div className="p-6 pt-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            {greeting}
          </h1>
          <p className="text-slate-400 text-sm">HillMusic 祝您天天开心</p>
        </div>
        <button
          onClick={onNavigateCheckIn}
          className="p-2.5 bg-[#0f172a] rounded-full text-slate-400 border border-white/5 shadow-sm">
          <Calendar size={24} />
        </button>
      </div>

      {/* Banner */}
      <div className="px-6 mb-8 relative h-48">
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
              <div className="relative w-full h-full">
                <img src={banner.image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-6 flex flex-col justify-end">
                  <span className="text-xs font-bold text-indigo-400 mb-1">
                    {banner.tag}
                  </span>
                  <h2 className="text-xl font-bold text-white">
                    {banner.title}
                  </h2>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* 每日推荐 */}
      <div className="mb-8">
        <div className="flex items-center justify-between px-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 text-white ">每日推荐</h2>
          <button
            onClick={() => dailyPlaylist && onNavigatePlaylist(dailyPlaylist)}
            className="text-xs text-indigo-400 flex items-center"
            disabled={!dailyPlaylist}
          >
            查看全部 <ChevronRight size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="flex overflow-x-auto no-scrollbar px-6 gap-4">
            {recSongs.map(song => (
              <div
                key={song.id}
                onClick={() => onPlaySong(song)}
                className="w-32 flex-shrink-0 cursor-pointer"
              >
                <div className="relative w-32 h-32 mb-2 rounded-xl overflow-hidden shadow-md  bg-[#0f172a]">
                  <img src={song.coverUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center">
                    <Play className="text-white fill-white" />
                  </div>
                </div>
                <div className="text-sm font-bold text-white truncate">{song.title}</div>
                <div className="text-xs text-slate-400 truncate">{song.artist}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 甄选歌单 */}
      <div className="px-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">甄选歌单</h2>

        <div className="grid grid-cols-2 gap-3">
          {playlists.slice(0, 6).map((playlist, idx) => {
            const bg = CARD_STYLES[idx % CARD_STYLES.length];
            const stack = playlist.coverImgStack || [];

            return (
              <div
                key={playlist.id}
                onClick={() => onNavigatePlaylist(playlist)}
                className={`relative h-28 ${bg} rounded-xl p-3 overflow-hidden cursor-pointer`}
              >
                <div className="absolute -right-10 -bottom-3 w-28 h-28 pointer-events-none">
                  <img src={stack[2]} className="absolute bottom-4 right-10 w-16 h-16 rounded-lg opacity-60" />
                  <img src={stack[1]} className="absolute bottom-5 right-5 w-16 h-16 rounded-lg opacity-85" />
                  <img src={stack[0]} className="absolute bottom-6 right-2 w-16 h-16 rounded-lg" />
                </div>

                <div className="relative z-10 pr-12">
                  <h3 className="text-base font-bold text-white line-clamp-2">
                    {playlist.title}
                  </h3>
                  <p className="text-[10px] text-white/80 line-clamp-2">
                    {playlist.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onNavigateSeeAllPlaylists}
          className="w-full mt-4 py-3 rounded-xl bg-[#0f172a] text-slate-300 font-bold text-sm shadow-sm border border-white/5 flex items-center justify-center gap-2"
        >
          <Grid size={16} /> 更多歌单 <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default Home;
