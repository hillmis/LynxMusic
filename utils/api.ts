
import { Song, Playlist } from '../types';

const DEFAULT_API_HOST = '';
const DEFAULT_API_KEY = '';

// 每一批请求的歌曲数量
const BATCH_SIZE = 30;

// 辅助函数：休眠
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            return data.data.map((item: any, index: number) => ({
                id: `api_${item.song_mid || item.songid || index}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                title: item.song_name || item.song_title || '未知歌曲',
                artist: item.song_singer || '未知歌手',
                album: item.album_name || '在线音乐',
                coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
                duration: 0,
                url: '',
                quality: item.quality || 'SQ无损',
                apiKeyword: keyword,
                originalIndex: index + 1,
                isDetailsLoaded: false
            }));
        }
        return [];
    } catch (error) { return []; }
};

export const fetchSongDetail = async (song: Song): Promise<Song> => {
    if (song.isDetailsLoaded && song.url) return song;

    const { host, key } = getApiConfig();
    if (!host || !key) return song;

    const cleanHost = host.replace(/\/$/, '');

    // 构造搜索关键词
    const searchMsg = song.apiKeyword || `${song.title} ${song.artist}`;
    const nValue = song.originalIndex || 1;

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
                lyrics: detailData.lyric ? detailData.lyric.replace(/\\n/g, '\n') : undefined,
                quality: detailData.quality || song.quality,
                isDetailsLoaded: true
            };
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

    for (const createProxyUrl of proxies) {
        try {
            const response = await fetch(targetUrl);
            if (response.ok) {
                const result = await response.json();
                if (result?.req?.data) {
                    return result.req.data;
                }
            }
        } catch (e) { }
    }
    return null;
};

export const fetchQQPlaylist = async (disstidStr: string): Promise<Playlist | null> => {
    const disstid = Number(disstidStr);
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
            const MAX_IMPORT = 500;
            const actualTotal = Math.min(totalNum, MAX_IMPORT);

            while (currentBegin < actualTotal) {
                await sleep(300);
                const batchData = await fetchQQBatch(disstid, currentBegin, BATCH_SIZE);
                if (batchData && batchData.songlist) {
                    allSongs.push(...parseSongs(batchData.songlist));
                } else {
                    break;
                }
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
    // 酷我移动端 API
    // rn=1000 表示一次获取1000首，通常不需要分页
    const targetUrl = `https://mobilist.kuwo.cn/list.s?type=songlist&id=${id}&pn=0&rn=1000`;

    // ✅ 修复1: 调整代理池顺序，allorigins 可能超时，corsproxy.io 通常更稳定
    const proxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        // corsproxy.org 的格式是 /?url=
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];

    let json: any = null;

    for (const createProxyUrl of proxies) {
        try {
            const proxyUrl = createProxyUrl(targetUrl);
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const text = await response.text();
                // ✅ 修复2: 酷我有时返回的是 HTML 包装的 JSON，或者带 BOM 头，需清理
                // 如果是 HTML，通常无法解析。如果是纯 JSON 但带 BOM，JSON.parse 可能失败。
                try {
                    // 尝试清理非 JSON 字符
                    const cleanText = text.trim().replace(/^[\uFEFF\s]+/, '');
                    json = JSON.parse(cleanText);
                } catch (e) {
                    console.warn("Kuwo JSON parse warning", e);
                }

                // 验证数据结构是否正确
                if (json && json.data && json.data.musiclist) {
                    break;
                }
            }
        } catch (e) {
            console.warn("Proxy failed", e);
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
            source: 'kuwo'
        };

        return playlist;

    } catch (e) {
        console.error("Kuwo Parse Error:", e);
        return null;
    }
};