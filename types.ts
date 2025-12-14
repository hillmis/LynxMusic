export enum Tab {
  HOME = 'HOME',
  DISCOVER = 'DISCOVER',
  PLAYING = 'PLAYING', // Full screen mode
  LOCAL = 'LOCAL',
  MINE = 'MINE'
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number; // in seconds
  url?: string; // For actual audio
}

export interface Playlist {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  songCount: number;
}

export interface ChartData {
  day: string;
  minutes: number;
}