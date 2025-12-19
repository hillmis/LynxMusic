import { Playlist } from '../types';
import { DYNAMIC_PLAYLIST_CONFIG } from '../constants';

export const ONLINE_PLAYLIST_FAVORITES_EVENT = 'online-playlist-fav-updated';
const STORAGE_KEY = 'hm_fav_playlists_v1';

type OnlinePlaylistConfig = {
  id: string;
  name: string;
  key: string;
  type?: 'keyword' | 'qq_id';
  tag?: string;
};

const getConfigList = (): OnlinePlaylistConfig[] => {
  return (DYNAMIC_PLAYLIST_CONFIG as any[]).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    key: String(item.key ?? ''),
    type: item.type || 'keyword',
    tag: item.tag || item.group || item.category
  }));
};

const getConfigMap = () => {
  const map = new Map<string, OnlinePlaylistConfig>();
  getConfigList().forEach((item) => map.set(item.id, item));
  return map;
};

const normalizeId = (rawId: string) => {
  if (rawId.startsWith('dp_all_')) return rawId.slice('dp_all_'.length);
  if (rawId.startsWith('dp_')) return rawId.slice('dp_'.length);
  return rawId;
};

export const readOnlinePlaylistFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    const map = getConfigMap();
    const normalized = (Array.isArray(arr) ? arr : [])
      .map((id) => normalizeId(String(id)))
      .filter((id) => map.has(id));
    return new Set(normalized);
  } catch {
    return new Set();
  }
};

export const writeOnlinePlaylistFavorites = (set: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch { }
  window.dispatchEvent(new Event(ONLINE_PLAYLIST_FAVORITES_EVENT));
};

export const getOnlinePlaylistConfigById = (id: string): OnlinePlaylistConfig | null => {
  const map = getConfigMap();
  return map.get(id) || null;
};

export const getOnlinePlaylistConfigList = (): OnlinePlaylistConfig[] => getConfigList();

export const getOnlinePlaylistConfigIdFromPlaylist = (playlist: Playlist): string | null => {
  if (!playlist) return null;
  const map = getConfigMap();

  const rawId = playlist.id || '';
  const normalized = normalizeId(rawId);
  if (map.has(normalized)) return normalized;

  if (playlist.apiKeyword) {
    const match = getConfigList().find(
      (item) => (item.type || 'keyword') === 'keyword' && item.key === playlist.apiKeyword
    );
    if (match) return match.id;
  }

  if (rawId.startsWith('qq_pl_')) {
    const qqId = rawId.slice('qq_pl_'.length);
    const match = getConfigList().find(
      (item) => (item.type || 'keyword') === 'qq_id' && item.key === qqId
    );
    if (match) return match.id;
  }

  return null;
};
