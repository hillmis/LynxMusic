
import { Song, Playlist } from '../types';

const DEFAULT_API_HOST = '';
const DEFAULT_API_KEY = '';

// 每一批请求的歌曲数量
const BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_LIMIT = 2;

// 辅助函数：休眠
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchTextWithTimeout = async (url: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } finally {
        clearTimeout(timeoutId);
    }
};

const fetchJsonWithTimeout = async (url: string, timeoutMs: number) => {
    const text = await fetchTextWithTimeout(url, timeoutMs);
    const cleanText = text.trim().replace(/^[\uFEFF\s]+/, '');
    return JSON.parse(cleanText);
};

export const getApiConfig = () => {
    return {
        host: localStorage.getItem('setting_api_host') || DEFAULT_API_HOST,
        key: localStorage.getItem('setting_api_key') || DEFAULT_API_KEY,
    };
};

// 测试 API 连接状态
export const testApiConnection = async (host: string, key: string): Promise<boolean> => {
    if (!host || !key) return false;
    const cleanHost = host.replace(/\/$/, '');
    const testUrl = `${cleanHost}/QQmusic/?key=${key}&n=&num=1&type=json&msg=test`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return false;

        const data = await response.json();
        return data.code === 200;
    } catch (e) {
        console.warn('API Connection Test Failed:', e);
        return false;
    }
};

export const searchMusic = async (keyword: string): Promise<Song[]> => {
    const { host, key } = getApiConfig();

    if (!host || !key) {
        return [];
    }

    const cleanHost = host.replace(/\/$/, '');
    const listUrl = `${cleanHost}/QQmusic/?key=${key}&n=&num=60&type=json&msg=${encodeURIComponent(keyword)}`;
    try {
        const response = await fetch(listUrl);
        const data = await response.json();
        if (data.code === 200 && Array.isArray(data.data)) {
            return data.data.map((item: any, index: number) => {
                const title = item.song_name || item.song_title || '未知歌曲';
                const artist = item.song_singer || '未知歌手';
                return {
                    id: `api_${item.song_mid || item.songid || index}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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
        }
        return [];
    } catch (error) { return []; }
};

export const fetchSongDetail = async (song: Song): Promise<Song> => {
    if (song.isDetailsLoaded && song.url) return song;

    const { host, key } = getApiConfig();
    if (!host || !key) return song;

    const cleanHost = host.replace(/\/$/, '');

    // 构造搜索关键词：优先“歌名+歌手”
    const searchMsg = `${song.title || ''} ${song.artist || ''}`.trim() || song.apiKeyword || song.title || '';
    const nValue =1;

    const url = `${cleanHost}/QQmusic/?key=${key}&n=${nValue}&num=60&type=json&msg=${encodeURIComponent(searchMsg)}`;

    try {
        const response = await fetch(url);
        const result = await response.json();

        let detailData = null;
        if (result.code === 200) {
            if (Array.isArray(result.data)) {
                detailData = result.data[0];
            } else {
                detailData = result.data;
            }
        }

        if (detailData) {
            return {
                ...song,
                coverUrl: detailData.cover || detailData.pic || song.coverUrl,
                url: detailData.music_url || detailData.url || '',
                lyrics: detailData.lyric ? detailData.lyrics.replace(/\\n/g, '\n') : undefined,
                quality: detailData.quality || song.quality,
                isDetailsLoaded: true
            };
        }
        // 尝试备用搜索：强制使用歌名+歌手
        if (searchMsg !== song.apiKeyword && (song.title || song.artist)) {
            return await fetchSongDetail({ ...song, apiKeyword: `${song.title || ''} ${song.artist || ''}`, originalIndex: 1 });
        }
        return song;
    } catch (error) {
        console.error("Fetch Detail Error:", error);
        return song;
    }
};

export const fetchMusicVideo = async (songTitle: string): Promise<string | null> => {
    const apiEndpoints = ['https://api.suol.cc/v1/mv.php'];
    for (const endpoint of apiEndpoints) {
        try {
            const url = `${endpoint}?msg=${encodeURIComponent(songTitle)}&n=1`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.code === 200 && data.url && data.url.length > 0) return data.url[0];
        } catch (e) { continue; }
    }
    return null;
};

export const getDynamicPlaylist = async (keyword: string): Promise<Song[]> => {
    return await searchMusic(keyword);
};

export const getTopCharts = async (chartId: string): Promise<Song[]> => {
    const cacheKey = `chart-${chartId}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const parsedData = JSON.parse(cachedData);
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                return parsedData;
            }
        } catch (e) {
            sessionStorage.removeItem(cacheKey);
        }
    }

    const url = `https://api.dragonlongzhu.cn/api/dg_QQphb.php?id=${chartId}&type=`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        let list: any[] = [];
        if (data.code === 200 && Array.isArray(data.data)) {
            list = data.data;
        } else if (Array.isArray(data)) {
            list = data;
        } else if (data.data && Array.isArray(data.data)) {
            list = data.data;
        }

        if (list.length === 0) return [];

        const songs: Song[] = list.map((item: any, index: number) => ({
            id: `chart_${chartId}_${index}_${item.song_mid || ''}`,
            title: item.title || item.song_name || '未知歌曲',
            artist: item.singer || item.song_singer || '未知歌手',
            coverUrl: item.cover || item.pic || `https://picsum.photos/300/300?random=${index}`,
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

    } catch (error) {
        console.error(`榜单 API 调用失败 (${chartId})`, error);
        return [];
    }
};

// --- QQ 歌单导入 核心逻辑 ---

const fetchQQBatch = async (disstid: number, begin: number, num: number): Promise<any> => {
    const data = {
        req: {
            module: "music.srfDissInfo.aiDissInfo",
            method: "uniform_get_Dissinfo",
            param: {
                song_begin: begin,
                song_num: num,
                disstid: disstid
            }
        }
    };

    const targetUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(data))}`;

    const proxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    const urls = proxies.map((createProxyUrl) => createProxyUrl(targetUrl)).concat([targetUrl]);

    for (const url of urls) {
        for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
            try {
                const result = await fetchJsonWithTimeout(url, REQUEST_TIMEOUT_MS);
                if (result?.req?.data) {
                    return result.req.data;
                }
            } catch (e) {
                if (attempt < RETRY_LIMIT) {
                    await sleep(300 * (attempt + 1));
                }
            }
        }
    }
    return null;
};

export const fetchQQPlaylist = async (disstidStr: string): Promise<Playlist | null> => {
    const disstid = Number(disstidStr);
    if (!disstid) return null;
    const allSongs: Song[] = [];
    let dirInfo: any = null;
    let totalNum = 0;

    try {
        const firstBatch = await fetchQQBatch(disstid, 0, BATCH_SIZE);

        if (!firstBatch || !firstBatch.dirinfo || !firstBatch.songlist) {
            throw new Error("Invalid playlist data");
        }

        dirInfo = firstBatch.dirinfo;
        totalNum = firstBatch.total_song_num || dirInfo.songnum || 0;

        const parseSongs = (list: any[]) => list.map((s: any) => {
            const albumMid = s.album?.mid || '';
            const songName = s.name || s.title || '未知歌曲';
            const singerName = s.singer?.map((singer: any) => singer.name).join(', ') || '未知歌手';

            return {
                id: `qq_${s.mid}`,
                title: songName,
                artist: singerName,
                album: s.album?.name || '',
                coverUrl: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : 'https://y.gtimg.cn/mediastyle/global/img/cover_like.png',
                duration: s.interval,
                source: 'qq' as const,
                url: '',
                isDetailsLoaded: false,
                apiKeyword: `${songName} ${singerName}`
            };
        });

        allSongs.push(...parseSongs(firstBatch.songlist));

        if (totalNum > BATCH_SIZE) {
            let currentBegin = BATCH_SIZE;
            const actualTotal = totalNum;

            while (currentBegin < actualTotal) {
                await sleep(300);
                const batchData = await fetchQQBatch(disstid, currentBegin, BATCH_SIZE);
                if (!batchData || !batchData.songlist) {
                    throw new Error(`Playlist batch missing at ${currentBegin}`);
                }
                allSongs.push(...parseSongs(batchData.songlist));
                currentBegin += BATCH_SIZE;
            }
        }

        const playlist: Playlist = {
            id: `qq_pl_${dirInfo.id}`,
            title: dirInfo.title,
            creator: dirInfo.nick || 'QQ音乐用户',
            coverUrl: dirInfo.picurl || allSongs[0]?.coverUrl || '',
            coverImgStack: allSongs.slice(0, 3).map(s => s.coverUrl).filter(Boolean),
            songCount: allSongs.length,
            description: dirInfo.desc ? dirInfo.desc.replace(/<br>/g, '\n') : '',
            songs: allSongs,
            apiKeyword: '',
            isLocal: false,
            source: 'qq'
        };

        return playlist;

    } catch (error) {
        console.error("QQ Playlist Fetch Error:", error);
        return null;
    }
};

// --- ✅ 修复：酷我歌单导入 ---

export const fetchKuwoPlaylist = async (id: string): Promise<Playlist | null> => {
    if (!id) return null;
    // 酷我移动端 API
    // rn=1000 表示一次获取1000首，通常不需要分页
    const targetUrl = `https://mobilist.kuwo.cn/list.s?type=songlist&id=${id}&pn=0&rn=300`;

    // ✅ 修复1: 调整代理池顺序，allorigins 可能超时，corsproxy.io 通常更稳定
    const proxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];

    let json: any = null;
    const urls = proxies.map((createProxyUrl) => createProxyUrl(targetUrl)).concat([targetUrl]);

    for (const url of urls) {
        for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
            try {
                const text = await fetchTextWithTimeout(url, REQUEST_TIMEOUT_MS);
                // Kuwo sometimes returns HTML or BOM-wrapped JSON; strip BOM before parse.
                try {
                    const cleanText = text.trim().replace(/^[\uFEFF\s]+/, '');
                    json = JSON.parse(cleanText);
                } catch (e) {
                    console.warn("Kuwo JSON parse warning", e);
                }

                if (json && json.data && json.data.musiclist) {
                    break;
                }
            } catch (e) {
                if (attempt < RETRY_LIMIT) {
                    await sleep(300 * (attempt + 1));
                } else {
                    console.warn("Proxy failed", e);
                }
            }
        }
        if (json && json.data && json.data.musiclist) {
            break;
        }
    }

    // ✅ 修复3: 适配你提供的 JSON 结构 (musiclist, artist, name, pic)
    if (!json || !json.data || !json.data.musiclist) {
        console.error("Kuwo Fetch Failed or Invalid Data");
        return null;
    }

    try {
        const musicList = json.data.musiclist;
        // 元数据适配
        const title = json.data.title || "酷我歌单"; // 接口似乎没返回 title，可能需要前端输入或使用默认
        const pic = json.data.img || musicList[0]?.img || ""; // 接口用 img 字段
        const intro = json.data.info || `共 ${musicList.length} 首歌曲`;

        const songs: Song[] = musicList.map((item: any) => {
            // ✅ 字段映射：酷我使用 name, artist, img
            const songName = item.name || "未知歌曲";
            const artistName = item.artist || "未知歌手";
            let cover = item.img || "";

            // 修复图片协议
            if (cover && cover.startsWith('http:')) {
                cover = cover.replace('http:', 'https:');
            }

            return {
                id: `kw_${item.rid || item.id}`,
                title: songName,
                artist: artistName,
                album: item.album || "",
                coverUrl: cover || 'https://y.gtimg.cn/mediastyle/global/img/cover_like.png',
                // 酷我 duration 单位是秒
                duration: parseInt(item.duration) || 0,
                source: 'kuwo' as const,
                url: '', // 播放链接需动态获取
                isDetailsLoaded: false,
                // ✅ 关键：构造搜索关键词，用于播放时搜索
                apiKeyword: `${songName} ${artistName}`
            };
        });

        const playlist: Playlist = {
            id: `kw_pl_${id}`,
            title: title === "酷我歌单" ? `酷我歌单 (${id})` : title, // 如果没标题，带上ID区分
            creator: '酷我音乐用户',
            coverUrl: pic,
            coverImgStack: songs.slice(0, 3).map(s => s.coverUrl).filter(Boolean),
            songCount: songs.length,
            description: intro,
            songs: songs,
            apiKeyword: '',
            isLocal: false,
            source: 'kw'
        };

        return playlist;

    } catch (e) {
        console.error("Kuwo Parse Error:", e);
        return null;
    }
};

// --- 网易云歌单导入 ---

export const fetchWangyiPlaylist = async (uid: string): Promise<Playlist | null> => {
    const cleanUid = uid.trim();
    if (!cleanUid) return null;

    const targetUrl = `https://node.api.xfabe.com/api/wangyi/userSongs?uid=${encodeURIComponent(cleanUid)}&limit=10000`;
    const proxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    const urls = proxies.map((createProxyUrl) => createProxyUrl(targetUrl)).concat([targetUrl]);
    let json: any = null;

    for (const url of urls) {
        for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
            try {
                json = await fetchJsonWithTimeout(url, REQUEST_TIMEOUT_MS);
                if (json && json.code === 200 && json.data) {
                    break;
                }
            } catch (e) {
                if (attempt < RETRY_LIMIT) {
                    await sleep(300 * (attempt + 1));
                }
            }
        }
        if (json && json.code === 200 && json.data) {
            break;
        }
    }

    if (!json || json.code !== 200 || !json.data || !Array.isArray(json.data.songs)) {
        console.error("Wangyi Fetch Failed or Invalid Data");
        return null;
    }

    const data = json.data;
    const songs: Song[] = data.songs.map((item: any) => {
        const title = item.name || '未知歌曲';
        const artist = item.artistsname || '未知歌手';
        const durationMs = Number(item.duration) || 0;
        return {
            id: `wy_${item.id}`,
            title,
            artist,
            album: item.album || '',
            coverUrl: item.picurl || '',
            duration: Math.floor(durationMs / 1000),
            source: 'netease',
            url: '',
            isDetailsLoaded: false,
            apiKeyword: `${title} ${artist}`
        };
    });

    const playlist: Playlist = {
        id: `wy_pl_${cleanUid}`,
        title: data.songName || '网易云歌单',
        creator: data.userName || '网易云用户',
        coverUrl: data.songPic || songs[0]?.coverUrl || '',
        coverImgStack: songs.slice(0, 3).map(s => s.coverUrl).filter(Boolean),
        songCount: songs.length,
        description: data.userSignature || '',
        songs,
        apiKeyword: '',
        isLocal: false,
        source: 'wy'
    };

    return playlist;
};

// --- 酷狗歌单导入 ---

export const fetchKugouPlaylist = async (input: string): Promise<Playlist | null> => {
    const rawInput = input.trim();
    if (!rawInput) return null;

    const targetUrl = `https://www.hhlqilongzhu.cn/api/QQmusic_ck/kugou_ids.php?id=${encodeURIComponent(rawInput)}&type=list`;
    const proxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    const urls = proxies.map((createProxyUrl) => createProxyUrl(targetUrl)).concat([targetUrl]);
    let json: any = null;

    for (const url of urls) {
        for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
            try {
                json = await fetchJsonWithTimeout(url, REQUEST_TIMEOUT_MS);
                if (json && json.status === 200 && json.body && json.body.data) {
                    break;
                }
            } catch (e) {
                if (attempt < RETRY_LIMIT) {
                    await sleep(300 * (attempt + 1));
                }
            }
        }
        if (json && json.status === 200 && json.body && json.body.data) {
            break;
        }
    }

    const data = json?.body?.data;
    const list = data?.info;
    if (!json || json.status !== 200 || !data || !Array.isArray(list)) {
        console.error("Kugou Fetch Failed or Invalid Data");
        return null;
    }

    const songs: Song[] = list.map((item: any) => {
        const title = item.name || '未知歌曲';
        const artist = Array.isArray(item.singerinfo)
            ? item.singerinfo.map((s: any) => s.name).filter(Boolean).join(', ')
            : (item.singername || '未知歌手');
        const durationMs = Number(item.timelen) || 0;
        let cover = item.cover || item.trans_param?.union_cover || '';
        if (cover && cover.includes('{size}')) {
            cover = cover.replace('{size}', '300');
        }
        if (cover && cover.startsWith('http:')) {
            cover = cover.replace('http:', 'https:');
        }
        return {
            id: `kg_${item.hash || item.audio_id || title}`,
            title,
            artist: artist || '未知歌手',
            album: item.albuminfo?.name || '',
            coverUrl: cover,
            duration: Math.floor(durationMs / 1000),
            source: 'kugou',
            url: '',
            isDetailsLoaded: false,
            apiKeyword: `${title} ${artist || ''}`.trim()
        };
    });

    const playlist: Playlist = {
        id: `kg_pl_${data.listid || data.userid || rawInput}`,
        title: '酷狗歌单',
        creator: data.userid ? `酷狗用户 ${data.userid}` : '酷狗用户',
        coverUrl: songs[0]?.coverUrl || '',
        coverImgStack: songs.slice(0, 3).map(s => s.coverUrl).filter(Boolean),
        songCount: songs.length,
        description: '',
        songs,
        apiKeyword: '',
        isLocal: false,
        source: 'kg'
    };

    return playlist;
};
