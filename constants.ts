

import { Song, Playlist } from './types';

// 统一配置动态歌单关键词
// ✅ 修改：扩展配置结构，支持 'keyword' 类型和 'qq_id' 类型
export const DYNAMIC_PLAYLIST_CONFIG = [
  // 原有动态关键词歌单
  { id: 'hot', name: '热门歌单', key: '热门', type: 'keyword' },
  { id: 'classic', name: '经典老歌', key: '经典', type: 'keyword' },
  { id: 'douyin', name: '抖音热歌', key: '抖音', type: 'keyword' },
  { id: 'rock', name: '摇滚激情', key: '摇滚', type: 'keyword' },
  { id: 'ancient', name: '古风雅韵', key: '古风', type: 'keyword' },
  { id: 'heal', name: '治愈系', key: '治愈', type: 'keyword' },
  { id: 'english', name: '欧美流行', key: '英文', type: 'keyword' },
  { id: 'dj', name: '车载DJ', key: '车载', type: 'keyword' },

  // ✅ 新增：推荐的 QQ 歌单 (ID 来自你提供的示例或其他热门ID)
  // key 填写 纯数字 disstid
  { id: 'qq_hot', name: '全网热歌', key: '8293804365', type: 'qq_id', tag: '官方甄选' },
  { id: 'qq_emo', name: '伤感治愈', key: '8626636060', type: 'qq_id', tag: '治愈' },
];

export const MOCK_SONGS: Song[] = [];
export const MOCK_PLAYLISTS: Playlist[] = [];
export const LISTENING_STATS: any[] = [ // Mock
  { day: '周一', minutes: 45 },
  { day: '周二', minutes: 70 },
  { day: '周三', minutes: 30 },
  { day: '周四', minutes: 90 },
  { day: '周五', minutes: 120 },
  { day: '周六', minutes: 180 },
  { day: '周日', minutes: 150 },
];