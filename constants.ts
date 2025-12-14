import { Song, Playlist, ChartData } from './types';

export const MOCK_SONGS: Song[] = [
  {
    id: '1',
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    coverUrl: 'https://picsum.photos/300/300?random=1',
    duration: 226,
  },
  {
    id: '2',
    title: '光年之外',
    artist: 'G.E.M. 邓紫棋',
    album: '摩天动物园',
    coverUrl: 'https://picsum.photos/300/300?random=2',
    duration: 235,
  },
  {
    id: '3',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    coverUrl: 'https://picsum.photos/300/300?random=3',
    duration: 200,
  },
  {
    id: '4',
    title: '七里香',
    artist: '周杰伦',
    album: '七里香',
    coverUrl: 'https://picsum.photos/300/300?random=4',
    duration: 299,
  },
  {
    id: '5',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    coverUrl: 'https://picsum.photos/300/300?random=5',
    duration: 203,
  },
  {
    id: '6',
    title: '孤勇者',
    artist: '陈奕迅',
    album: '孤勇者',
    coverUrl: 'https://picsum.photos/300/300?random=6',
    duration: 256,
  }
];

export const MOCK_PLAYLISTS: Playlist[] = [
  {
    id: 'p1',
    title: '午后慵懒时光',
    creator: 'HillMusic 官方',
    coverUrl: 'https://picsum.photos/300/300?random=10',
    songCount: 45
  },
  {
    id: 'p2',
    title: '运动燃脂必备',
    creator: '健身达人',
    coverUrl: 'https://picsum.photos/300/300?random=11',
    songCount: 32
  },
  {
    id: 'p3',
    title: '深度专注/学习',
    creator: '自律社',
    coverUrl: 'https://picsum.photos/300/300?random=12',
    songCount: 120
  }
];

export const LISTENING_STATS: ChartData[] = [
  { day: '周一', minutes: 45 },
  { day: '周二', minutes: 70 },
  { day: '周三', minutes: 30 },
  { day: '周四', minutes: 90 },
  { day: '周五', minutes: 120 },
  { day: '周六', minutes: 180 },
  { day: '周日', minutes: 150 },
];