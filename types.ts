
declare global {
  interface Window {
    webapp?: {
      // 权限相关
      bestow: () => boolean; // 检查权限 true=已授权
      rights: () => void;    // 请求权限
      toast: (msg: string) => void;

      // 文件读取
      listfile: (path: string) => string; // 返回文件名列表，用"/"分割，失败返回"null"
      gainsize: (path: string) => number;
      gainfile: (path: string, offset?: number, length?: number) => string;

      // 兼容：部分端可能还有这些
      open?: (url: string) => void;
      copy?: (text: string) => void;
    };
  }
}

// ✅ 修改：添加 'kuwo'
export type MusicSource =
  | 'local'
  | 'download'
  | 'qq'
  | 'netease'
  | 'kugou'
  | 'kuwo'
  | 'migu'
  | 'unknown';

export interface Song {
  id: string;
  title: string;
  artist: string;

  // 你原本的字段（保持兼容）
  album?: string;
  duration?: number;        // 秒
  quality?: string;
  path?: string;
  source?: MusicSource;

  // 播放/展示必须字段（补齐）
  url?: string;             // http(s) 或 file://
  coverUrl?: string;
  mvUrl?: string;

  // 状态
  apiKeyword?: string;
  isDetailsLoaded?: boolean;

  // 歌单
  addedAt?: number;

  // 歌词
  lyric?: string;
}

export interface Playlist {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  coverImgStack?: string[];
  songCount: number;
  description?: string;

  // 动态歌单
  apiKeyword?: string;

  // 本地自建歌单
  songs?: Song[];
  isLocal?: boolean;
  createdAt?: number;
  updatedAt?: number;

  // ✅ 修改：添加 'kuwo'
  source?: 'local' | 'qq' | 'kw' | 'wy' | 'kg';
}

export interface Task {
  id: string;
  title: string;
  reward: string;
  completed: boolean;
}

/** App Tabs */
export enum Tab {
  HOME = 'HOME',
  DISCOVER = 'DISCOVER',
  LOCAL = 'LOCAL',
  MINE = 'MINE',
  PLAYING = 'PLAYING',
}

/** App 子页面栈 */
export type SubView =
  | { type: 'NONE' }
  | { type: 'CHECK_IN' }
  | { type: 'PLAYLIST_DETAIL'; playlist: Playlist }
  | { type: 'SEE_ALL_SONGS' }
  | { type: 'SEE_ALL_PLAYLISTS' }
  | { type: 'CHART_DETAIL'; title: string; gradient: string; chartId: string }
  | { type: 'SETTINGS' }
  | { type: 'STATISTIC_DETAIL' }
  | { type: 'RECENT' };
