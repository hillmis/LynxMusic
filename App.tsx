
import React, { useState, useEffect } from 'react';
import { Tab, SubView, Song } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Discover from './pages/Discover';
import PlayerSwiper from './components/PlayerSwiper';
import Local from './pages/Local';
import Mine from './pages/Mine';
import CheckIn from './pages/CheckIn';
import PlaylistDetail from './pages/PlaylistDetail';
import SeeAllSongs from './pages/SeeAllSongs';
import SeeAllPlaylists from './pages/SeeAllPlaylists';
import ChartDetail from './pages/ChartDetail';
import Settings from './pages/Settings';
import StatisticDetail from './pages/StatisticDetail';
import Recent from './pages/Recent';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [subView, setSubView] = useState<SubView>({ type: 'NONE' });
  const [isFullScreenPlayer, setIsFullScreenPlayer] = useState<boolean>(false);

  // ✅ 修复：补回 viewMode 状态定义
  const [viewMode, setViewMode] = useState<'music' | 'video'>('music');


  const player = useAudioPlayer();

  // 监听返回键
  useEffect(() => {
    window.history.pushState({ page: 'main' }, '');
    const handleBack = () => {
      if (isFullScreenPlayer) {
        setIsFullScreenPlayer(false);
        window.history.pushState({ page: 'main' }, '');
      } else if (subView.type !== 'NONE') {
        setSubView({ type: 'NONE' });
        window.history.pushState({ page: 'main' }, '');
      }
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [isFullScreenPlayer, subView]);



  // 监听全局 "播放MV" 事件
  useEffect(() => {
    const handlePlayMv = (e: CustomEvent<Song>) => {
      const song = e.detail;
      if (song) {
        player.playSong(song);
        setViewMode('video');
        setIsFullScreenPlayer(true);
        window.history.pushState({ page: 'player' }, '');
      }
    };

    window.addEventListener('hm-play-mv' as any, handlePlayMv);
    return () => window.removeEventListener('hm-play-mv' as any, handlePlayMv);
  }, [player]);

  const handleTabChange = (tab: Tab) => {
    if (tab === Tab.PLAYING) {
      setIsFullScreenPlayer(true);
      window.history.pushState({ page: 'player' }, '');
    } else {
      setActiveTab(tab);
      setSubView({ type: 'NONE' });
      setIsFullScreenPlayer(false);
    }
  };

  const handleChartSearch = (keyword: string) => {
    setSubView({ type: 'NONE' });
    setActiveTab(Tab.DISCOVER);
    localStorage.setItem('temp_auto_search', keyword);
    setTimeout(() => setActiveTab(Tab.DISCOVER), 0);
  };

  const commonProps = { onBack: () => setSubView({ type: 'NONE' }) };

  const renderSubView = () => {
    switch (subView.type) {
      case 'CHECK_IN': return <CheckIn {...commonProps} />;
      case 'PLAYLIST_DETAIL': return <PlaylistDetail playlist={subView.playlist} {...commonProps} onPlaySong={player.playSong} onPlayList={player.playList} onAddToQueue={player.addToQueue} onAddAllToQueue={player.addAllToQueue} currentSong={player.currentSong} />;
      case 'SEE_ALL_SONGS': return <SeeAllSongs {...commonProps} onPlaySong={player.playSong} onAddToQueue={player.addToQueue} onAddAllToQueue={player.addAllToQueue} currentSong={player.currentSong} />;
      case 'SEE_ALL_PLAYLISTS': return <SeeAllPlaylists {...commonProps} onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} />;
      case 'CHART_DETAIL': return <ChartDetail title={subView.title} gradient={subView.gradient} chartId={subView.chartId} {...commonProps} onSearch={handleChartSearch} currentSong={player.currentSong} />;
      case 'STATISTIC_DETAIL': return <StatisticDetail {...commonProps} />;
      case 'SETTINGS': return <Settings {...commonProps} />;
      case 'RECENT': return <Recent {...commonProps} onPlaySong={player.playSong} onAddToQueue={player.addToQueue} />;
      default: return null;
    }
  };

  const renderMainContent = () => {
    if (subView.type !== 'NONE') return renderSubView();
    switch (activeTab) {
      case Tab.HOME: return <Home onPlaySong={player.playSong} onNavigateCheckIn={() => setSubView({ type: 'CHECK_IN' })} onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} onNavigateSeeAllSongs={() => setSubView({ type: 'SEE_ALL_SONGS' })} onNavigateSeeAllPlaylists={() => setSubView({ type: 'SEE_ALL_PLAYLISTS' })} />;
      case Tab.DISCOVER: return <Discover onPlaySong={player.playSong} currentSong={player.currentSong} onNavigateChart={(t, g, c) => setSubView({ type: 'CHART_DETAIL', title: t, gradient: g, chartId: c })} onAddToQueue={player.addToQueue} />;
      case Tab.LOCAL: return <Local />;
      case Tab.MINE: return <Mine onNavigatePlaylist={(pl) => setSubView({ type: 'PLAYLIST_DETAIL', playlist: pl })} onNavigateSettings={() => setSubView({ type: 'SETTINGS' })} onNavigateChart={() => setSubView({ type: 'STATISTIC_DETAIL' })} onNavigateRecent={() => setSubView({ type: 'RECENT' })} onNavigateLocal={() => setActiveTab(Tab.LOCAL)} />;
      default: return null;
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col mx-auto max-w-md shadow-2xl bg-[#0f172a] transition-colors duration-300">

      {/* 背景光斑：深色模式显示，浅色模式隐藏 */}
      <div className="absolute inset-0 z-[-1] overflow-hidden opacity-50 transition-opacity duration-500 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] rounded-full bg-indigo-500/30 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[40%] rounded-full bg-purple-500/30 blur-[100px]" />
      </div>

      <div className="flex-1 overflow-hidden relative z-0">
        {renderMainContent()}
      </div>

      {subView.type === 'NONE' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          currentSong={player.currentSong}
          isPlaying={player.isPlaying}
        />
      )}

      {isFullScreenPlayer && player.currentSong && (
        <PlayerSwiper
          currentSong={player.currentSong}
          playlist={player.playlist}
          isPlaying={player.isPlaying}
          progress={player.progress}
          duration={player.duration}
          mode={player.mode}
          setMode={player.setMode}
          onClose={() => { setIsFullScreenPlayer(false); window.history.back(); }}
          onTogglePlay={player.togglePlay}
          onNext={player.playNext}
          onPrev={player.playPrev}
          onSeek={player.setProgress}
          onPlayFromQueue={player.playSong}
          onRemoveFromQueue={player.removeFromQueue}
          onUpdateSong={player.updateSongInPlaylist}
          onAddToQueue={player.addToQueue}
          // ✅ 传递 viewMode 状态
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}
    </div>
  );
};

export default App;