import React, { useState } from 'react';
import { Tab, Song } from './types';
import { MOCK_SONGS } from './constants';
import BottomNav from './components/BottomNav';
import PlayerBar from './components/PlayerBar';
import Home from './pages/Home';
import Discover from './pages/Discover';
import Playing from './pages/Playing';
import Local from './pages/Local';
import Mine from './pages/Mine';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [currentSong, setCurrentSong] = useState<Song | null>(MOCK_SONGS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFullScreenPlayer, setIsFullScreenPlayer] = useState<boolean>(false);

  const handlePlaySong = (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (!currentSong) return;
    const currentIndex = MOCK_SONGS.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % MOCK_SONGS.length;
    setCurrentSong(MOCK_SONGS[nextIndex]);
  };

  const handlePrev = () => {
    if (!currentSong) return;
    const currentIndex = MOCK_SONGS.findIndex(s => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + MOCK_SONGS.length) % MOCK_SONGS.length;
    setCurrentSong(MOCK_SONGS[prevIndex]);
  };

  const handleTabChange = (tab: Tab) => {
      if (tab === Tab.PLAYING) {
          setIsFullScreenPlayer(true);
      } else {
          setActiveTab(tab);
          setIsFullScreenPlayer(false);
      }
  };

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden flex flex-col mx-auto max-w-md shadow-2xl">
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === Tab.HOME && <Home onPlaySong={handlePlaySong} currentSong={currentSong} />}
        {activeTab === Tab.DISCOVER && <Discover onPlaySong={handlePlaySong} currentSong={currentSong} />}
        {activeTab === Tab.LOCAL && <Local />}
        {activeTab === Tab.MINE && <Mine />}
      </div>

      {/* Floating Player Bar (Visible only when not full screen and song exists) */}
      {!isFullScreenPlayer && currentSong && (
        <PlayerBar 
          song={currentSong} 
          isPlaying={isPlaying} 
          onTogglePlay={togglePlay}
          onExpand={() => setIsFullScreenPlayer(true)}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Full Screen Player Overlay */}
      {isFullScreenPlayer && (
        <Playing 
          song={currentSong} 
          isPlaying={isPlaying} 
          onClose={() => setIsFullScreenPlayer(false)}
          onTogglePlay={togglePlay}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
    </div>
  );
};

export default App;