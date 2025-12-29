import { Song, Playlist } from '../types';

// --- 配置与常量 ---
const DEFAULT_API_HOST = '';//例子：https://sdkapi.hhlqilongzhu.cn/api
const DEFAULT_API_KEY = '';
const PROXY_POOL = [
    (url: string) => `https://bird.ioliu.cn/v1/?url=${encodeURIComponent(url)}`,               // 国内可直连
    (url: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,    // 稳定免费
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,          // 轻量备用
    (url: string) => `https://v1.cors.workers.dev/?u=${encodeURIComponent(url)}`,              // Cloudflare 辅助                       // 你的代理放最后
];

// 性能调优参数
const BATCH_SIZE = 30;           // 每批次请求歌曲数
const REQUEST_TIMEOUT_MS = 10000; // 默认10秒超时
const RETRY_LIMIT = 2;           // 最大重试次数

// --- 基础辅助函数 ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 强制处理 HTTPS 协议，修复混合内容拦截
 */
const ensureHttps = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url.replace(/^http:/, 'https:');
};

/**
 * 智能分流请求引擎：
 * 1. 针对国内直连 API (DragonLongzhu, Xfabe) 优先不走代理，提速 200%。
 * 2. 针对需要伪造 Referer 的平台 (QQ, 酷我) 自动走你的专属代理。
 * 3. 支持 skipProxy 参数，手动强制直连。
 */
const fastFetch = async (
    url: string,
    options: { timeout?: number; forceProxy?: boolean; skipProxy?: boolean; fallbackToProxy?: boolean } = {}
): Promise<any> => {
    const { timeout = REQUEST_TIMEOUT_MS, forceProxy = false, skipProxy = false, fallbackToProxy = true } = options;

    // 逻辑：只有包含 QQ 和 酷我 的才走代理。酷狗 (kugou.com) 按要求不走代理。
    const isMusicApi = url.includes('qq.com') || url.includes('kuwo.cn');
    const needsProxy = !skipProxy && (forceProxy || isMusicApi);

    const fetchJson = async (target: string) => {
        let lastError: any;
        for (let i = 0; i <= RETRY_LIMIT; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(target, {
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                });
                if (!response.ok) {
                    const error: any = new Error(`HTTP ${response.status}`);
                    error.status = response.status;
                    throw error;
                }
                const text = await response.text();
                clearTimeout(timeoutId);
                const cleanText = text.trim().replace(/^[\uFEFF\s]+/, '');
                return JSON.parse(cleanText);
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (i < RETRY_LIMIT) {
                    await sleep(300 * (i + 1));
                    continue;
                }
            }
        }
        throw lastError;
    };

    const fetchThroughProxies = async (rawUrl: string) => {
        const proxyList = PROXY_POOL;
        const targetList = [rawUrl];
        if (rawUrl.startsWith('https://') && rawUrl.includes('hhlqilongzhu.cn')) {
            targetList.push(rawUrl.replace('https://', 'http://'));
        }
        let lastError: any;
        for (const target of targetList) {
            for (const toProxy of proxyList) {
                try {
                    const proxiedUrl = toProxy(target);
                    return await fetchJson(proxiedUrl);
                } catch (err) {
                    lastError = err;
                    continue;
                }
            }
        }
        throw lastError;
    };

    try {
        if (needsProxy) {
            return await fetchThroughProxies(url);
        }
        return await fetchJson(url);
    } catch (err: any) {
        // 如果是证书错误且是直连，尝试切换到 http (针对 hhlqilongzhu 这种证书过期的站)
        if (!needsProxy && url.startsWith('https://www.hhlqilongzhu.cn')) {
            const httpUrl = url.replace('https://', 'http://');
            return await fastFetch(httpUrl, { ...options, skipProxy: true });
        }

        // 代理链路 526（源站证书问题）时，尝试降级为 http 重新走代理
        if ((err as any)?.status === 526 && url.includes('hhlqilongzhu.cn')) {
            const httpUrl = url.replace('https://', 'http://');
            return await fastFetch(httpUrl, { ...options, forceProxy: true, skipProxy: false, fallbackToProxy: false });
        }

        // 直连失败（CORS/证书/301）时兜底走代理，避免被浏览器拦截
        if (!needsProxy && fallbackToProxy) {
            return await fetchThroughProxies(url);
        }

        throw err;
    }
};

export const getApiConfig = () => {
    return {
        host: (localStorage.getItem('setting_api_host') || DEFAULT_API_HOST).replace(/\/$/, ''),
        key: localStorage.getItem('setting_api_key') || DEFAULT_API_KEY,
    };
};

// --- API 核心功能实现 ---

/**
 * 测试 API 连接
 */
export const testApiConnection = async (host: string, key: string): Promise<boolean> => {
    if (!host || !key) return false;
    const cleanHost = host.replace(/\/$/, '');
    const testUrl = `${cleanHost}/QQmusic/?key=${key}&n=1&num=1&type=json&msg=test`;

    try {
        const data = await fastFetch(testUrl, { timeout: 5000 });
        return data.code === 200 || data.status === 200;
    } catch {
        return false;
    }
};

/**
 * 音乐搜索
 */
export const searchMusic = async (keyword: string): Promise<Song[]> => {
    const { host, key } = getApiConfig();
    if (!host || !key) return [];

    const url = `${host}/QQmusic/?key=${key}&num=60&type=json&msg=${encodeURIComponent(keyword)}`;
    try {
        const data = await fastFetch(url);
        const list = Array.isArray(data.data) ? data.data : [];

        return list.map((item: any, index: number) => {
            const title = item.song_name || item.song_title || '未知歌曲';
            const artist = item.song_singer || '未知歌手';
            return {
                id: `api_${item.song_mid || item.songid || index}_${Date.now()}`,
                title,
                artist,
                album: item.album_name || '在线音乐',
                coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
                duration: 0,
                url: '',
                quality: item.quality || 'SQ无损',
                apiKeyword: `${title} ${artist}`,
                originalIndex: index + 1,
                isDetailsLoaded: false
            };
        });
    } catch { return []; }
};

/**
 * 获取歌曲详情（播放链接、歌词和专辑图）
 */
export const fetchSongDetail = async (song: Song): Promise<Song> => {
    if (song.isDetailsLoaded && song.url) return song;

    const { host, key } = getApiConfig();
    if (!host || !key) return song;

    const searchMsg = (song.apiKeyword || `${song.title} ${song.artist}`).trim();
    const url = `${host}/QQmusic/?key=${key}&n=1&type=json&msg=${encodeURIComponent(searchMsg)}`;

    try {
        const result = await fastFetch(url, { timeout: 8000 });
        const detailData = Array.isArray(result.data) ? result.data[0] : result.data;

        if (detailData) {
            return {
                ...song,
                coverUrl: ensureHttps(detailData.cover || detailData.pic || song.coverUrl),
                url: detailData.music_url || detailData.url || '',
                lyrics: detailData.lyric ? detailData.lyric.replace(/\\n/g, '\n') : undefined,
                quality: detailData.quality || song.quality,
                isDetailsLoaded: true
            };
        }
        return song;
    } catch { return song; }
};

/**
 * 获取 MV
 */
export const fetchMusicVideo = async (songTitle: string): Promise<string | null> => {
    try {
        const data = await fastFetch(`https://api.suol.cc/v1/mv.php?msg=${encodeURIComponent(songTitle)}&n=1`);
        return (data && data.code === 200 && data.url?.[0]) ? data.url[0] : null;
    } catch { return null; }
};

export const getDynamicPlaylist = async (keyword: string): Promise<Song[]> => {
    return await searchMusic(keyword);
};

/**
 * 获取排行榜
 */
export const getTopCharts = async (chartId: string): Promise<Song[]> => {
    const cacheKey = `chart-${chartId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `https://api.dragonlongzhu.cn/api/dg_QQphb.php?id=${chartId}`;
    try {
        const data = await fastFetch(url);
        const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

        const songs: Song[] = list.map((item: any, index: number) => ({
            id: `chart_${chartId}_${index}_${item.song_mid || ''}`,
            title: item.title || item.song_name || '未知歌曲',
            artist: item.singer || item.song_singer || '未知歌手',
            coverUrl: ensureHttps(item.cover || item.pic || ''),
            album: '排行榜',
            duration: 0,
            url: '',
            quality: 'Chart',
            apiKeyword: `${item.title || item.song_name} ${item.singer || item.song_singer}`,
            originalIndex: 1,
            isDetailsLoaded: false
        }));

        sessionStorage.setItem(cacheKey, JSON.stringify(songs));
        return songs;
    } catch { return []; }
};

// --- 各平台导入逻辑 ---

/**
 * QQ 歌单导入（并行并发）
 */
export const fetchQQPlaylist = async (disstidStr: string): Promise<Playlist | null> => {
    const disstid = Number(disstidStr);
    if (!disstid) return null;

    const buildUrl = (begin: number) => {
        const data = { req: { module: "music.srfDissInfo.aiDissInfo", method: "uniform_get_Dissinfo", param: { song_begin: begin, song_num: BATCH_SIZE, disstid } } };
        return `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(data))}`;
    };

    const parseSongs = (list: any[]) => (list || []).map((s: any) => ({
        id: `qq_${s.mid}`,
        title: s.name || s.title || '未知歌曲',
        artist: s.singer?.map((singer: any) => singer.name).join(', ') || '未知歌手',
        album: s.album?.name || '',
        coverUrl: s.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` : '',
        duration: s.interval || 0,
        source: 'qq' as const,
        url: '',
        isDetailsLoaded: false,
        apiKeyword: `${s.name} ${s.singer?.[0]?.name || ''}`
    }));

    try {
        const firstBatch = await fastFetch(buildUrl(0));
        const resData = firstBatch?.req?.data;
        if (!resData || !resData.dirinfo) return null;

        const totalNum = resData.total_song_num || resData.dirinfo.songnum || 0;
        let allSongs: Song[] = parseSongs(resData.songlist);

        if (totalNum > BATCH_SIZE) {
            const nextBatches = [];
            for (let begin = BATCH_SIZE; begin < totalNum; begin += BATCH_SIZE) {
                nextBatches.push(fastFetch(buildUrl(begin)));
            }
            const results = await Promise.allSettled(nextBatches);
            results.forEach(res => {
                if (res.status === 'fulfilled' && res.value?.req?.data?.songlist) {
                    allSongs.push(...parseSongs(res.value.req.data.songlist));
                }
            });
        }

        return {
            id: `qq_pl_${disstid}`,
            title: resData.dirinfo.title,
            creator: resData.dirinfo.nick || 'QQ音乐用户',
            coverUrl: ensureHttps(resData.dirinfo.picurl || allSongs[0]?.coverUrl || ''),
            coverImgStack: allSongs.slice(0, 3).map(s => s.coverUrl),
            songCount: allSongs.length,
            description: resData.dirinfo.desc || '',
            songs: allSongs,
            apiKeyword: '',
            isLocal: false,
            source: 'qq'
        };
    } catch { return null; }
};

/**
 * 酷我歌单导入
 */
export const fetchKuwoPlaylist = async (id: string): Promise<Playlist | null> => {
    const url = `https://mobilist.kuwo.cn/list.s?type=songlist&id=${id}&pn=0&rn=500`;
    try {
        const json = await fastFetch(url);
        const list = json?.data?.musiclist || [];
        const songs: Song[] = list.map((item: any) => ({
            id: `kw_${item.rid || item.id}`,
            title: item.name || "未知歌曲",
            artist: item.artist || "未知歌手",
            album: item.album || "",
            coverUrl: ensureHttps(item.img || item.pic || ''),
            duration: parseInt(item.duration) || 0,
            source: 'kuwo' as const,
            url: '',
            isDetailsLoaded: false,
            apiKeyword: `${item.name} ${item.artist}`
        }));

        return {
            id: `kw_pl_${id}`,
            title: json.data?.title || "酷我歌单",
            creator: '酷我用户',
            coverUrl: ensureHttps(json.data?.img || songs[0]?.coverUrl),
            coverImgStack: songs.slice(0, 3).map(s => s.coverUrl),
            songCount: songs.length,
            description: json.data?.info || '',
            songs,
            apiKeyword: '',
            isLocal: false,
            source: 'kw'
        };
    } catch { return null; }
};

/**
 * 网易云歌单导入
 */
export const fetchWangyiPlaylist = async (uid: string): Promise<Playlist | null> => {
    const url = `https://node.api.xfabe.com/api/wangyi/userSongs?uid=${encodeURIComponent(uid.trim())}&limit=1000`;
    try {
        const json = await fastFetch(url, { skipProxy: true });
        if (json?.code !== 200 || !json.data?.songs) return null;

        const songs: Song[] = json.data.songs.map((item: any) => ({
            id: `wy_${item.id}`,
            title: item.name,
            artist: item.artistsname,
            album: item.album || '',
            coverUrl: ensureHttps(item.picurl),
            duration: Math.floor((item.duration || 0) / 1000),
            source: 'netease',
            url: '',
            isDetailsLoaded: false,
            apiKeyword: `${item.name} ${item.artistsname}`
        }));

        return {
            id: `wy_pl_${uid}`,
            title: json.data.songName || '网易云歌单',
            creator: json.data.userName || '网易云用户',
            coverUrl: ensureHttps(json.data.songPic || songs[0]?.coverUrl),
            coverImgStack: songs.slice(0, 3).map(s => s.coverUrl),
            songCount: songs.length,
            description: json.data.userSignature || '',
            songs,
            apiKeyword: '',
            isLocal: false,
            source: 'wy'
        };
    } catch { return null; }
};

/**
 * 酷狗歌单导入 - 按照要求：完全直连，不走代理
 */
export const fetchKugouPlaylist = async (input: string): Promise<Playlist | null> => {
    const url = `https://www.hhlqilongzhu.cn/api/QQmusic_ck/kugou_ids.php?id=${encodeURIComponent(input.trim())}&type=list`;
    try {
        // 优先直连，失败自动兜底代理规避 CORS/证书问题
        const json = await fastFetch(url, { skipProxy: true, fallbackToProxy: true });
        const data = json?.body?.data;
        if (!data?.info) return null;

        const stripSingerPrefix = (name: string, singer?: string) => {
            if (!name) return name;
            const normName = name.trim();
            const normSinger = (singer || '').trim();
            const prefixes = [
                `${normSinger} - `,
                `${normSinger}-`,
            ].filter(p => p.trim().length > 0);
            for (const p of prefixes) {
                if (normName.toLowerCase().startsWith(p.toLowerCase())) {
                    return normName.slice(p.length).trim();
                }
            }
            // 常见格式：Singer - Song
            const parts = normName.split(' - ');
            if (parts.length >= 2) {
                return parts.slice(1).join(' - ').trim();
            }
            return normName;
        };

        const songs: Song[] = data.info.map((item: any) => ({
            id: `kg_${item.hash || item.audio_id}`,
            title: stripSingerPrefix(item.name, Array.isArray(item.singerinfo) ? item.singerinfo[0]?.name : item.singername),
            artist: Array.isArray(item.singerinfo) ? item.singerinfo[0]?.name : item.singername,
            album: item.albuminfo?.name || '',
            coverUrl: ensureHttps((item.cover || '').replace('{size}', '400')),
            duration: Math.floor((item.timelen || 0) / 1000),
            source: 'kugou',
            url: '',
            isDetailsLoaded: false,
            apiKeyword: `${item.name} ${item.singername}`
        }));

        return {
            id: `kg_pl_${input}`,
            title: '酷狗歌单',
            creator: data.userid ? `用户(${data.userid})` : '酷狗用户',
            coverUrl: songs[0]?.coverUrl || '',
            coverImgStack: songs.slice(0, 3).map(s => s.coverUrl),
            songCount: songs.length,
            description: '',
            songs,
            apiKeyword: '',
            isLocal: false,
            source: 'kg'
        };
    } catch { return null; }
};
