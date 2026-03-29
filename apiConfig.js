// apiConfig.js
// 这是一个标准的 API 接口配置文件，供项目统一导入使用。
// =======================================
// 说明：
// 1. 如果全局运行时已使用 configureApi(API_CONFIG)，应用会自动启用这里的 host/key。
// 2. 在需要单次覆盖的接口调用处，可传入 options 进行本次调用覆盖配置。
// 3. `fetchJson`/`fetchRaw` 已经在 utils/api.ts 中封装，支持这些参数。


// 按数据类型（功能）配置接口，与平台无关，并支持多个音源切换
export const API_TYPE_CONFIG = {
    search: {
        sources: [
            {
                name: '标准搜索接口',
                url: 'https://sdkapi.hhlqilongzhu.cn/api/QQmusic/?key={key}&num=60&type=json&msg={keyword}',
                fieldMap: {
                    id: 'song_mid',
                    title: 'song_name',
                    artist: 'song_singer',
                    album: 'album_name',
                    coverUrl: 'cover',
                    duration: 'interval',
                    apiKeyword: 'apiKeyword'
                }
            },
            {
                name: '可选搜索接口1',
                url: 'https://api.example.com/search?query={keyword}&limit=60',
                fieldMap: {
                    id: 'id',
                    title: 'name',
                    artist: 'artist',
                    album: 'album',
                    coverUrl: 'pic',
                    duration: 'duration'
                }
            }
        ],
        defaultSource: '标准搜索接口'
    },
    source: {
        sources: [
            {
                name: '音源默认1',
                url: 'https://sdkapi.hhlqilongzhu.cn/api/QQmusic/?key={key}&n=1&type=json&msg={keyword}',
                fieldMap: {
                    url: 'music_url',
                    quality: 'quality',
                    lyrics: 'lyric'
                }
            },
            {
                name: '音源备选2',
                url: 'https://node.api.xfabe.com/api/wangyi/userSongs?uid={uid}&limit=1000',
                fieldMap: {
                    url: 'url',
                    quality: 'quality',
                    lyrics: 'lyrics'
                }
            }
        ],
        defaultSource: '音源默认1'
    },
    mv: {
        sources: [
            {
                name: 'MV接口',
                url: 'https://api.suol.cc/v1/mv.php?msg={keyword}&n=1',
                fieldMap: {
                    url: 'url'
                }
            }
        ],
        defaultSource: 'MV接口'
    },
    lyrics: {
        sources: [
            {
                name: '歌词接口',
                url: 'https://sdkapi.hhlqilongzhu.cn/api/QQmusic/?key={key}&n=1&type=json&msg={query}',
                fieldMap: {
                    lyrics: 'lyric'
                }
            }
        ],
        defaultSource: '歌词接口'
    },
    cover: {
        sources: [
            {
                name: '专辑封面接口',
                url: 'https://sdkapi.hhlqilongzhu.cn/api/QQmusic/?key={key}&n=1&type=json&msg={query}',
                fieldMap: {
                    coverUrl: 'cover'
                }
            }
        ],
        defaultSource: '专辑封面接口'
    },
    topCharts: {
        sources: [
            {
                name: '热搜榜',
                url: 'https://api.dragonlongzhu.cn/api/dg_QQphb.php?id={chartId}',
                fieldMap: {
                    id: 'song_mid',
                    title: 'title',
                    artist: 'singer',
                    coverUrl: 'cover'
                }
            }
        ],
        defaultSource: '热搜榜'
    },
    playlist: {
        sources: [
            {
                name: 'QQ歌单',
                url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?data={payload}',
                fieldMap: {
                    id: 'dissid',
                    title: 'title',
                    creator: 'creator',
                    songs: 'songlist'
                }
            },
            {
                name: '酷我歌单',
                url: 'https://mobilist.kuwo.cn/list.s?type=songlist&id={id}&pn=0&rn=500',
                fieldMap: {
                    id: 'id',
                    title: 'title',
                    creator: 'creator',
                    songs: 'musiclist'
                }
            },
            {
                name: '网易云歌单',
                url: 'https://node.api.xfabe.com/api/wangyi/userSongs?uid={uid}&limit=1000',
                fieldMap: {
                    id: 'uid',
                    title: 'songName',
                    creator: 'userName',
                    songs: 'songs'
                }
            },
            {
                name: '酷狗歌单',
                url: 'https://www.hhlqilongzhu.cn/api/QQmusic_ck/kugou_ids.php?id={id}&type=list',
                fieldMap: {
                    id: 'id',
                    title: 'title',
                    creator: 'userid',
                    songs: 'info'
                }
            }
        ],
        defaultSource: 'QQ歌单'
    }
};
