import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Settings, Music, Shuffle, Repeat, ListMusic, X, Moon, Sun, 
  Heart, Clock, TrendingUp, Radio, Share2, Timer, Zap, ExternalLink, Minimize2, Maximize2, PictureInPicture
} from 'lucide-react';
import type { Song, Toast } from '@/types';
import { searchSongs, clearSearchCache } from '@/utils/api';
import { usePlayer } from '@/hooks/usePlayer';
import { useQueue } from '@/hooks/useQueue';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { TRENDING_SEARCHES, MOODS } from '@/data/artists';
import { useArtistImages } from '@/hooks/useArtistImages'; // नया Hook इम्पोर्ट किया
import { initYouTubePlayer, PlayerState as YTPlayerState } from '@/utils/youtubePlayer';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [darkMode, setDarkMode] = useState(true);
  const [provider, setProvider] = useState<'invidious' | 'piped' | 'youtube'>('piped');
  const [apiKey, setApiKey] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isPlayerInitialized, setIsPlayerInitialized] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [isFullPlayer, setIsFullPlayer] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { cachedSongs, handleClearCache } = useOfflineCache();
  const { queue, addToQueue, removeFromQueue, clearQueue } = useQueue();
  const player = usePlayer(queue);
  
  // नया Hook: यहाँ आर्टिस्ट्स की रियल इमेजेज लोड होंगी
  const { artists: popularArtists, loading: artistsLoading } = useArtistImages();

  // Ref to always keep the latest player instance for callbacks/events
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // Load settings from localStorage
  useEffect(() => {
    const savedApiKey = localStorage.getItem('youtubeApiKey') || '';
    const savedProvider = (localStorage.getItem('preferredProvider') || 'piped') as 'invidious' | 'piped' | 'youtube';
    const savedDarkMode = localStorage.getItem('darkMode') !== 'false';
    const savedRecent = localStorage.getItem('recentlyPlayed');
    const savedFavorites = localStorage.getItem('favorites');
    
    setApiKey(savedApiKey);
    setTempApiKey(savedApiKey);
    setProvider(savedProvider);
    setDarkMode(savedDarkMode);
    
    if (savedRecent) {
      try {
        setRecentlyPlayed(JSON.parse(savedRecent));
      } catch {}
    }
    
    if (savedFavorites) {
      try {
        setFavorites(new Set(JSON.parse(savedFavorites)));
      } catch {}
    }
  }, []);

  // Initialize YouTube player (with delay to ensure DOM is ready)
  useEffect(() => {
    const initPlayer = async () => {
      try {
        await initYouTubePlayer('youtube-player', {
          onReady: () => {
            console.log('YouTube player ready');
            setIsPlayerInitialized(true);
          },
          onStateChange: (event) => {
            if (event.data === YTPlayerState.ENDED) {
              // Use ref to avoid stale closure bug
              playerRef.current.next();
            }
          },
          onError: (event) => {
            console.error('YouTube player error:', event.data);
            addToast('Playback error. Try another song.', 'error');
          }
        });
      } catch (error) {
        console.error('Failed to init player:', error);
      }
    };
    
    // Small delay ensures the DOM container is fully mounted
    const timer = setTimeout(initPlayer, 500);
    return () => clearTimeout(timer);
  }, []);

  // Sleep Timer logic
  useEffect(() => {
    if (sleepTimerMinutes === null) {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      return;
    }

    if (sleepTimerMinutes <= 0) {
      playerRef.current.pause();
      setSleepTimerMinutes(null);
      addToast('Sleep timer finished. Playback stopped.', 'info');
      return;
    }

    sleepTimerRef.current = setInterval(() => {
      setSleepTimerMinutes(prev => (prev !== null ? prev - 1 : null));
    }, 60000); // Check every minute

    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, [sleepTimerMinutes, addToast]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await searchSongs(searchQuery, apiKey, provider);

      if (result.songs.length === 0) {
        setError('No songs found. Try a different search term.');
        setSearchResults([]);
      } else {
        setSearchResults(result.songs);
        addToast(`Found ${result.songs.length} songs via ${result.provider}`, 'success');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please check your internet connection.');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addToRecentlyPlayed = (song: Song) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.videoId !== song.videoId);
      const updated = [song, ...filtered].slice(0, 20);
      localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleFavorite = useCallback((song: Song) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(song.videoId)) {
        newSet.delete(song.videoId);
        addToast('Removed from favorites', 'info');
      } else {
        newSet.add(song.videoId);
        addToast('Added to favorites', 'success');
      }
      localStorage.setItem('favorites', JSON.stringify([...newSet]));
      return newSet;
    });
  }, [addToast]);

  // Ref for toggleFavorite to prevent re-renders in keyboard hook
  const toggleFavoriteRef = useRef(toggleFavorite);
  useEffect(() => {
    toggleFavoriteRef.current = toggleFavorite;
  }, [toggleFavorite]);

  const handlePlaySong = (song: Song) => {
    addToRecentlyPlayed(song);
    if (!queue.some(s => s.videoId === song.videoId)) {
      addToQueue(song);
    }
    playerRef.current.playSong(song, [...queue, song]);
    addToast(`Playing: ${song.title}`, 'success');
  };

  const handleAddToQueue = (song: Song) => {
    if (!queue.some(s => s.videoId === song.videoId)) {
      addToQueue(song);
      addToast(`Added to queue: ${song.title}`, 'success');
    } else {
      addToast('Song already in queue', 'info');
    }
  };

  const handleQuickSearch = async (query: string) => {
    setSearchQuery(query);
    setIsLoading(true);
    setError(null);
    try {
      const result = await searchSongs(query, apiKey, provider);
      setSearchResults(result.songs);
      if (result.songs.length === 0) {
        setError(`No songs found for "${query}"`);
      } else {
        addToast(`Found ${result.songs.length} songs`, 'success');
      }
    } catch (err) {
      console.error('Quick search error:', err);
      setError(`Failed to search for "${query}"`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistClick = async (artistName: string) => {
    await handleQuickSearch(artistName + ' songs');
  };

  const handleMoodClick = async (query: string) => {
    await handleQuickSearch(query);
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('youtubeApiKey', tempApiKey);
    setApiKey(tempApiKey);
    addToast('API key saved!', 'success');
    setShowSettings(false);
  };

  const handleSaveProvider = (newProvider: 'invidious' | 'piped' | 'youtube') => {
    localStorage.setItem('preferredProvider', newProvider);
    setProvider(newProvider);
    addToast(`Switched to ${newProvider}`, 'success');
  };

  const handleToggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
  };

  // Keyboard shortcuts (bound only once using refs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const p = playerRef.current;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          p.togglePlay();
          break;
        case 'KeyK':
          p.togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            p.seekForward();
          }
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            p.seekBackward();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          p.setVolume(Math.min(100, p.playerState.volume + 10));
          break;
        case 'ArrowDown':
          e.preventDefault();
          p.setVolume(Math.max(0, p.playerState.volume - 10));
          break;
        case 'KeyM':
          p.toggleMute();
          break;
        case 'KeyN':
          p.next();
          break;
        case 'KeyP':
          p.previous();
          break;
        case 'KeyS':
          p.toggleShuffle();
          break;
        case 'KeyR':
          const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all'];
          const currentIndex = modes.indexOf(p.playerState.repeatMode);
          p.setRepeatMode(modes[(currentIndex + 1) % modes.length]);
          break;
        case 'KeyF':
          if (p.currentSong) {
            toggleFavoriteRef.current(p.currentSong);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty dependency ensures it doesn't re-bind and cause bugs

  const themeClasses = darkMode
    ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white'
    : 'bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100 text-gray-900';

  const cardClasses = darkMode
    ? 'bg-white/10 backdrop-blur-lg border-white/20'
    : 'bg-white/70 backdrop-blur-lg border-gray-200';

  const progressPercent = player.playerState.duration 
    ? (player.playerState.currentTime / player.playerState.duration) * 100 
    : 0;

  return (
    <div className={`min-h-screen ${themeClasses} transition-colors duration-300`}>
      {/* YouTube Player Container (Safely hidden off-screen) */}
      <div 
        ref={playerContainerRef}
        id="youtube-player" 
        className="fixed pointer-events-none"
        style={{ top: '-9999px', left: '-9999px', width: '1px', height: '1px' }}
        aria-hidden="true"
      />

      {/* Header */}
      <header className={`${cardClasses} border-b sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-pink-500 rounded-xl shadow-lg">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                🎵 PrivMITLab
              </h1>
              <p className="text-xs text-gray-400">Stream unlimited music</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`text-xs px-2 py-1 rounded-full ${isPlayerInitialized ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {isPlayerInitialized ? '● Ready' : '○ Loading...'}
            </div>
            <button
              onClick={handleToggleDarkMode}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-48">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className={`flex gap-3 p-2 rounded-2xl ${cardClasses} border shadow-lg`}>
            <Search className="w-6 h-6 ml-3 text-violet-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for songs, artists, albums..."
              className={`flex-1 bg-transparent outline-none px-3 py-2 ${darkMode ? 'placeholder-white/50' : 'placeholder-gray-400'}`}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-gradient-to-r from-violet-500 to-pink-500 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500">Provider: <span className="font-semibold text-violet-400">{provider}</span></p>
            <p className="text-xs text-gray-500">
              Shortcuts: Space=Play/Pause, N=Next, P=Prev, M=Mute
            </p>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400">
            <p className="font-medium">⚠️ {error}</p>
            <p className="text-xs mt-2">Try different keywords or switch provider in Settings</p>
          </div>
        )}

        {/* Mood Browsing */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Music className="w-5 h-5 text-violet-400" />
            🎭 Browse by Mood
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {MOODS.map((mood) => (
              <button
                key={mood.id}
                onClick={() => handleMoodClick(mood.query)}
                className={`flex-shrink-0 px-4 py-2 rounded-full ${cardClasses} border hover:border-violet-500/50 transition-all hover:scale-105 text-sm font-medium`}
              >
                {mood.name}
              </button>
            ))}
          </div>
        </section>

        {/* Popular Artists - यहाँ सुधार किया गया है */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Music className="w-5 h-5 text-violet-400" />
              🎤 Popular Artists
            </h2>
            <span className="text-xs text-gray-400">{popularArtists.length} artists</span>
          </div>
          
          {artistsLoading && <p className="text-gray-400 text-sm mb-3 animate-pulse">Loading artist images...</p>}
          
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {popularArtists.map((artist) => (
              <button
                key={artist.id}
                onClick={() => handleArtistClick(artist.name)}
                className={`p-3 rounded-xl ${cardClasses} border text-center hover:border-violet-500/50 transition-all hover:scale-105 group`}
              >
                <img
                  src={artist.image}
                  alt={artist.name}
                  className="w-16 h-16 rounded-full mx-auto mb-2 object-cover ring-2 ring-violet-500/30 group-hover:ring-violet-500 transition-all"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    // अगर इमेज फेल हो तो Dicebear पर वापस जाएगा (100% काम करेगा)
                    img.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist.name)}&backgroundColor=c084fc,fb7185,f59e0b,6366f1,22d3ee&textColor=ffffff`;
                  }}
                />
                <p className="text-xs font-medium truncate">{artist.name}</p>
                <p className="text-[10px] text-gray-400">{artist.genre}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Trending Searches */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            🔥 Trending Searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {TRENDING_SEARCHES.map((term, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickSearch(term)}
                className={`px-3 py-1.5 rounded-full text-sm ${cardClasses} border hover:border-violet-500/50 transition-all hover:scale-105`}
              >
                {term}
              </button>
            ))}
          </div>
        </section>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">🔍 Search Results ({searchResults.length})</h2>
              <button
                onClick={() => setSearchResults([])}
                className={`px-3 py-1 rounded-lg ${darkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'} transition-colors text-sm`}
              >
                Clear
              </button>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {searchResults.map((song) => (
                <div
                  key={song.videoId}
                  className={`flex items-center gap-3 p-3 rounded-xl ${cardClasses} border hover:border-violet-500/50 transition-all group`}
                >
                  <div className="relative">
                    <img
                      src={song.thumbnail || `https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`}
                      alt={song.title}
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${song.videoId}/default.jpg`;
                      }}
                    />
                    <button
                      onClick={() => handlePlaySong(song)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Play className="w-6 h-6 text-white" />
                    </button>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{song.title}</p>
                    <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-gray-600'} truncate`}>
                      {song.artist}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>
                        {song.duration}
                      </span>
                      {favorites.has(song.videoId) && (
                        <Heart className="w-3 h-3 text-pink-500 fill-pink-500" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleFavorite(song)}
                      className={`p-2 rounded-full transition-colors ${
                        favorites.has(song.videoId) 
                          ? 'text-pink-500' 
                          : darkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-500'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${favorites.has(song.videoId) ? 'fill-pink-500' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleAddToQueue(song)}
                      className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                      title="Add to queue"
                    >
                      <ListMusic className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePlaySong(song)}
                      className="p-2 bg-violet-500 rounded-full hover:bg-violet-600 transition-colors"
                    >
                      <Play className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-violet-400" />
              ⏱️ Recently Played
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {recentlyPlayed.slice(0, 10).map((song) => (
                <button
                  key={song.videoId}
                  onClick={() => handlePlaySong(song)}
                  className={`flex-shrink-0 p-3 rounded-xl ${cardClasses} border hover:border-violet-500/50 transition-all text-left min-w-[160px] group`}
                >
                  <div className="relative mb-2">
                    <img
                      src={song.thumbnail || `https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`}
                      alt={song.title}
                      className="w-full h-20 rounded-lg object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <p className="text-xs font-medium truncate">{song.title}</p>
                  <p className={`text-[10px] ${darkMode ? 'text-white/50' : 'text-gray-500'} truncate`}>
                    {song.artist}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Offline Songs */}
        {cachedSongs.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-3">💾 Offline Songs ({cachedSongs.length})</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cachedSongs.slice(0, 10).map((song) => (
                <div
                  key={song.videoId}
                  className={`flex items-center gap-3 p-3 rounded-xl ${cardClasses} border hover:border-green-500/50 transition-colors`}
                >
                  <img
                    src={song.thumbnail}
                    alt={song.title}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{song.title}</p>
                    <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-gray-600'} truncate`}>
                      {song.artist}
                    </p>
                  </div>
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Cached</span>
                  <button
                    onClick={() => handlePlaySong(song)}
                    className="p-2 bg-green-500 rounded-full hover:bg-green-600 transition-colors flex-shrink-0"
                  >
                    <Play className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Now Playing Bar */}
      {player.currentSong && (
        <div className={`fixed bottom-0 left-0 right-0 ${cardClasses} border-t z-40 shadow-2xl`}>
          {/* Progress Bar (clickable) */}
          <div 
            className={`w-full h-1 ${darkMode ? 'bg-white/10' : 'bg-gray-300'} cursor-pointer group relative`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              playerRef.current.seek(percent * (player.playerState.duration || 1));
            }}
          >
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-pink-500 relative z-10"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          
          {/* Visualizer Canvas overlay */}
          {player.isPlaying && (
             <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none opacity-30 -translate-y-full overflow-hidden">
                <canvas 
                  ref={player.setCanvasRef}
                  className="w-full h-full"
                />
             </div>
          )}
          
          <div className="max-w-7xl mx-auto px-4 py-3 mobile-bottom-player">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Song Info - Click to open full player on mobile */}
              <div 
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer sm:cursor-default"
                onClick={() => window.innerWidth < 640 && setIsFullPlayer(true)}
              >
                <div className="relative group/disk">
                   <img
                     src={player.currentSong.thumbnail || `https://img.youtube.com/vi/${player.currentSong.videoId}/mqdefault.jpg`}
                     alt={player.currentSong.title}
                     className={`w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-white/20 shadow-lg transition-transform ${player.isPlaying ? 'animate-spin-slow' : 'scale-95'}`}
                     onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${player.currentSong?.videoId}/hqdefault.jpg`;
                     }}
                   />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-slate-900 rounded-full border border-white/50" />
                   </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-sm">{player.currentSong.title}</p>
                  <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-gray-600'} truncate`}>
                    {player.currentSong.artist}
                  </p>
                </div>
                <button
                  onClick={() => toggleFavorite(player.currentSong!)}
                  className={`p-2 rounded-full transition-colors ${
                    favorites.has(player.currentSong.videoId) 
                      ? 'text-pink-500' 
                      : darkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-500'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${favorites.has(player.currentSong.videoId) ? 'fill-pink-500' : ''}`} />
                </button>
              </div>

              {/* Main Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => player.toggleShuffle()}
                  className={`p-2 rounded-lg transition-colors ${
                    player.playerState.isShuffle
                      ? 'bg-violet-500 text-white'
                      : darkMode
                      ? 'hover:bg-white/10 text-white/60'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title="Shuffle (S)"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => player.previous()}
                  className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
                  title="Previous (P)"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => player.togglePlay()}
                  className="p-3 bg-gradient-to-r from-violet-500 to-pink-500 rounded-full hover:opacity-90 transition-opacity shadow-lg"
                  title="Play/Pause (Space)"
                >
                  {player.isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-0.5" />
                  )}
                </button>
                
                <button
                  onClick={() => player.next()}
                  className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
                  title="Next (N)"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => {
                    const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all'];
                    const currentIndex = modes.indexOf(player.playerState.repeatMode);
                    player.setRepeatMode(modes[(currentIndex + 1) % modes.length]);
                  }}
                  className={`p-2 rounded-lg transition-colors relative hidden sm:block ${
                    player.playerState.repeatMode !== 'none'
                      ? 'bg-violet-500 text-white'
                      : darkMode
                      ? 'hover:bg-white/10 text-white/60'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title="Repeat (R)"
                >
                  <Repeat className="w-4 h-4" />
                  {player.playerState.repeatMode === 'one' && (
                    <span className="absolute top-0 right-0 text-[8px] font-bold">1</span>
                  )}
                </button>
              </div>

              {/* Volume & Time - Hidden/Modified on small screens */}
              <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end">
                <div className="hidden md:flex items-center gap-2">
                   <span className="text-xs text-gray-400 w-10 text-right">
                    {formatTime(player.playerState.currentTime)}
                  </span>
                  <span className="text-xs text-gray-400">/</span>
                  <span className="text-xs text-gray-400 w-10">
                    {formatTime(player.playerState.duration)}
                  </span>
                </div>
                
                <div className="hidden lg:flex items-center gap-2 border-r border-white/10 pr-3 mr-1">
                  <button
                    onClick={() => player.toggleMute()}
                    className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
                    title="Mute (M)"
                  >
                    {player.playerState.isMuted ? (
                      <VolumeX className="w-4 h-4 text-red-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={player.playerState.isMuted ? 0 : player.playerState.volume}
                    onChange={(e) => player.setVolume(Number(e.target.value))}
                    className="w-20 h-1 accent-violet-500"
                  />
                </div>

                {/* Extra Features Buttons */}
                <div className="flex items-center gap-1">
                   <button
                    onClick={() => setShowSleepTimer(true)}
                    className={`p-2 rounded-lg transition-colors relative ${
                      sleepTimerMinutes !== null ? 'text-violet-400' : darkMode ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Sleep Timer"
                  >
                    <Timer className="w-5 h-5" />
                    {sleepTimerMinutes !== null && (
                      <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[8px] rounded-full px-1 py-0.5">
                        {sleepTimerMinutes}m
                      </span>
                    )}
                  </button>

                  <div className="relative group">
                    <button
                      className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'}`}
                      title="Playback Speed"
                    >
                      <Zap className={`w-5 h-5 ${player.playbackRate !== 1 ? 'text-yellow-400' : ''}`} />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 invisible group-hover:visible bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                        <button
                          key={rate}
                          onClick={() => player.setPlaybackRate(rate)}
                          className={`w-full px-4 py-2 text-xs text-left hover:bg-white/10 transition-colors ${player.playbackRate === rate ? 'text-violet-400 bg-white/5 font-bold' : 'text-white'}`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setIsPiP(!isPiP)}
                    className={`p-2 rounded-lg transition-colors ${isPiP ? 'text-violet-400 bg-white/10' : darkMode ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'}`}
                    title="Toggle PiP Mode"
                  >
                    <PictureInPicture className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => setShowQueue(!showQueue)}
                    className={`p-2 rounded-lg transition-colors ${
                      showQueue
                        ? 'bg-violet-500 text-white'
                        : darkMode
                        ? 'hover:bg-white/10 text-white/60'
                        : 'hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Queue"
                  >
                    <ListMusic className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue Panel */}
      {showQueue && (
        <div className={`fixed right-0 top-16 bottom-[88px] w-full sm:w-80 ${cardClasses} border-l z-30 overflow-hidden flex flex-col animate-slide-up sm:animate-none`}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-violet-400" />
              Queue ({queue.length})
            </h3>
            <button
              onClick={() => clearQueue()}
              className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
            {queue.length === 0 ? (
              <div className="text-center py-10 opacity-30">
                <Music className="w-12 h-12 mx-auto mb-2" />
                <p className="text-sm">Queue is empty</p>
              </div>
            ) : (
              <div className="space-y-1">
                {queue.map((song, index) => (
                  <div
                    key={`${song.videoId}-${index}`}
                    className={`flex items-center gap-2 p-2 rounded-xl group transition-all ${
                      player.currentSong?.videoId === song.videoId 
                        ? 'bg-violet-500/20 border border-violet-500/30' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="relative w-10 h-10 flex-shrink-0">
                      <img
                        src={song.thumbnail || `https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                        alt=""
                        className="w-full h-full rounded-lg object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${player.currentSong?.videoId === song.videoId ? 'text-violet-400' : ''}`}>
                        {song.title}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-1">
                       <button
                         onClick={() => playerRef.current.playSong(song, queue)}
                         className="p-1.5 hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity"
                       >
                         <Play className="w-3.5 h-3.5 fill-current" />
                       </button>
                       <button
                         onClick={() => removeFromQueue(song.videoId)}
                         className="p-1.5 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                       >
                         <X className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sleep Timer Modal */}
      {showSleepTimer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-scale-in">
          <div className={`${cardClasses} border w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl`}>
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-violet-400" />
                  Sleep Timer
                </h3>
                <button onClick={() => setShowSleepTimer(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[15, 30, 45, 60, 90, 120].map(mins => (
                  <button
                    key={mins}
                    onClick={() => {
                      setSleepTimerMinutes(mins);
                      setShowSleepTimer(false);
                      addToast(`Sleep timer set for ${mins} minutes`, 'success');
                    }}
                    className={`py-4 rounded-[20px] border transition-all ${
                      sleepTimerMinutes === mins 
                        ? 'bg-violet-500 border-violet-400 text-white shadow-lg shadow-violet-500/20' 
                        : 'bg-white/5 border-white/10 hover:border-violet-500/30'
                    }`}
                  >
                    <span className="block text-xl font-black">{mins}</span>
                    <span className="text-[10px] uppercase tracking-widest opacity-60">min</span>
                  </button>
                ))}
              </div>

              {sleepTimerMinutes !== null && (
                <button
                  onClick={() => {
                    setSleepTimerMinutes(null);
                    setShowSleepTimer(false);
                    addToast('Timer cancelled', 'info');
                  }}
                  className="w-full mt-6 py-4 rounded-2xl bg-red-500/10 text-red-400 font-bold hover:bg-red-500/20 transition-all border border-red-500/20"
                >
                  Cancel Timer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PiP Mini Player */}
      {isPiP && player.currentSong && (
        <div className="fixed bottom-24 right-4 w-56 sm:w-72 glass-dark border border-white/20 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-scale-in group">
          <div className="relative aspect-video">
            <img 
              src={player.currentSong.thumbnail} 
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button onClick={() => player.previous()} className="p-2 hover:bg-white/20 rounded-full"><SkipBack className="w-5 h-5 text-white fill-current" /></button>
              <button 
                onClick={() => player.togglePlay()}
                className="p-3 bg-white text-slate-900 rounded-full hover:scale-105 transition-all"
              >
                {player.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={() => player.next()} className="p-2 hover:bg-white/20 rounded-full"><SkipForward className="w-5 h-5 text-white fill-current" /></button>
            </div>
            <button 
              onClick={() => setIsPiP(false)}
              className="absolute top-2 right-2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
          <div className="p-3">
             <p className="text-[11px] font-bold truncate">{player.currentSong.title}</p>
             <p className="text-[9px] opacity-60 truncate">{player.currentSong.artist}</p>
             <div className="mt-2 h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500" style={{ width: `${progressPercent}%` }} />
             </div>
          </div>
        </div>
      )}

      {/* Full Screen Player (Mobile) */}
      {isFullPlayer && player.currentSong && (
        <div className="fixed inset-0 z-[80] bg-slate-950 animate-slide-up flex flex-col overflow-hidden">
          <div className="absolute inset-0 opacity-40">
             <img src={player.currentSong.thumbnail} alt="" className="w-full h-full object-cover blur-3xl scale-150" />
          </div>

          <header className="relative z-10 p-6 flex justify-between items-center">
            <button onClick={() => setIsFullPlayer(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Minimize2 className="w-7 h-7" /></button>
            <div className="text-center">
              <p className="text-[10px] font-black tracking-widest text-violet-400 uppercase">Now Playing</p>
            </div>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Share2 className="w-6 h-6" /></button>
          </header>

          <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-10 pb-12">
            <div className="relative w-full aspect-square max-w-[320px] mb-12">
              <img 
                src={player.currentSong.thumbnail || `https://img.youtube.com/vi/${player.currentSong.videoId}/maxresdefault.jpg`} 
                alt=""
                className={`w-full h-full object-cover rounded-[40px] shadow-2xl transition-all duration-700 ${player.isPlaying ? 'scale-100 shadow-violet-500/20' : 'scale-90 opacity-80'}`}
              />
              <div className={`absolute -bottom-4 -right-4 w-28 h-28 rounded-full border-4 border-slate-950 bg-slate-900 shadow-2xl transition-transform ${player.isPlaying ? 'animate-spin-slow' : ''}`}>
                 <img src={player.currentSong.thumbnail} alt="" className="w-full h-full rounded-full object-cover p-1" />
              </div>
            </div>

            <div className="w-full max-w-[320px] mb-10 text-left">
              <h2 className="text-2xl font-black mb-1 line-clamp-2 leading-tight">{player.currentSong.title}</h2>
              <p className="text-lg text-white/50 font-medium truncate">{player.currentSong.artist}</p>
            </div>

            <div className="w-full max-w-[320px] mb-10">
               <div className="w-full h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  playerRef.current.seek(((e.clientX - rect.left) / rect.width) * (player.playerState.duration || 1));
               }}>
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
               </div>
               <div className="flex justify-between text-[10px] font-bold text-white/40 tracking-widest">
                  <span>{formatTime(player.playerState.currentTime)}</span>
                  <span>{formatTime(player.playerState.duration)}</span>
               </div>
            </div>

            <div className="w-full max-w-[340px] flex items-center justify-between mb-10">
              <button onClick={() => player.toggleShuffle()} className={player.playerState.isShuffle ? 'text-violet-400' : 'text-white/30'}><Shuffle className="w-6 h-6" /></button>
              <button onClick={() => player.previous()} className="text-white active:scale-90 transition-transform"><SkipBack className="w-10 h-10 fill-current" /></button>
              <button onClick={() => player.togglePlay()} className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-slate-950 shadow-2xl active:scale-95 transition-all">
                {player.isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current ml-2" />}
              </button>
              <button onClick={() => player.next()} className="text-white active:scale-90 transition-transform"><SkipForward className="w-10 h-10 fill-current" /></button>
              <button onClick={() => player.setRepeatMode(player.playerState.repeatMode === 'all' ? 'none' : 'all')} className={player.playerState.repeatMode !== 'none' ? 'text-violet-400' : 'text-white/30'}><Repeat className="w-6 h-6" /></button>
            </div>
          </main>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-scale-in">
          <div className={`${cardClasses} border w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl`}>
            <div className="p-8">
              <header className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-black flex items-center gap-3"><Settings className="w-6 h-6 text-violet-400" /> Settings</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-7 h-7" /></button>
              </header>
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 ml-1">Streaming Provider</label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-black/20 rounded-2xl">
                    {(['piped', 'invidious', 'youtube'] as const).map(p => (
                      <button key={p} onClick={() => handleSaveProvider(p)} className={`py-3 text-xs font-bold rounded-xl transition-all ${provider === p ? 'bg-violet-500 text-white shadow-lg' : 'text-gray-500 hover:bg-white/5'}`}>{p.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-1">YouTube Data API Key</label>
                  <input type="password" value={tempApiKey} onChange={e => setTempApiKey(e.target.value)} placeholder="Key (optional)" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-violet-500 transition-all font-mono text-sm" />
                </div>
                <div className="flex gap-4">
                  <button onClick={() => { handleClearCache(); addToast('Cache cleared', 'success'); }} className="flex-1 py-4 text-xs font-bold rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">Clear Storage</button>
                  <button onClick={handleSaveApiKey} className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-pink-500 text-white font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popups */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 w-full max-w-sm">
        {toasts.map(toast => (
          <div key={toast.id} className="px-6 py-4 rounded-[24px] shadow-2xl glass border border-white/10 animate-scale-in flex items-center justify-between">
            <div className="flex items-center gap-3 truncate">
              <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-green-400' : toast.type === 'error' ? 'bg-red-400' : 'bg-violet-400'}`} />
              <p className="text-sm font-bold truncate text-white">{toast.message}</p>
            </div>
            <button onClick={() => setToasts(t => t.filter(x => x.id !== toast.id))} className="text-white/40"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default App;
