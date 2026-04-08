import React, { useState, useEffect, useRef } from 'react';
import { 
  Library, 
  Music, 
  Film, 
  Plus, 
  Search, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  MoreVertical, 
  Trash2, 
  Cloud, 
  ListMusic, 
  Maximize, 
  Minimize,
  ChevronDown,
  Share2,
  Repeat,
  Shuffle,
  Settings,
  User,
  Download,
  Lock,
  Unlock,
  Scissors,
  RotateCcw,
  RotateCw,
  Monitor,
  Subtitles,
  Headphones,
  Zap,
  History,
  FolderOpen,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Toaster, toast } from 'sonner';
import { dbLocal, type MediaFile } from '@/src/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { auth, loginWithGoogle, logout, db as firestore, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// --- Types ---
interface Playlist {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  tracks: Partial<MediaFile>[];
  createdAt: any;
}

// Connection test
async function testConnection() {
  try {
    await getDocs(query(collection(firestore, 'playlists'), where('ownerId', '==', 'test')));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [activeTab, setActiveTab] = useState('music');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState<MediaFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPlaylistDialogOpen, setIsPlaylistDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isAudioExpanded, setIsAudioExpanded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [showControls, setShowControls] = useState(true);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'fit' | 'fill' | 'stretch'>('fit');
  const [lastTap, setLastTap] = useState(0);
  const [isDiscSpinning, setIsDiscSpinning] = useState(false);
  const [videoSubTab, setVideoSubTab] = useState<'video' | 'folder' | 'playlist'>('video');
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVideoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap detected
      setIsPlaying(!isPlaying);
      setLastTap(0); // Reset
    } else {
      // Single tap
      handleMouseMove(); // Show controls
      setLastTap(now);
    }
  };

  const togglePlaybackSpeed = () => {
    const speeds = [0.5, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
  };

  const toggleAspectRatio = () => {
    const modes: ('fit' | 'fill' | 'stretch')[] = ['fit', 'fill', 'stretch'];
    const currentIndex = modes.indexOf(aspectRatio);
    setAspectRatio(modes[(currentIndex + 1) % modes.length]);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Data Queries ---
  const localLibrary = useLiveQuery(
    () => dbLocal.mediaFiles.toArray(),
    []
  );

  const filteredLibrary = localLibrary?.filter(file => {
    const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.album.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = 
      activeTab === 'search' ? true :
      activeTab === 'music' ? file.type === 'audio' :
      activeTab === 'videos' ? file.type === 'video' :
      true;
    
    return matchesSearch && matchesTab;
  });

  // --- Thumbnail Generation for existing videos ---
  useEffect(() => {
    const generateMissingThumbnails = async () => {
      if (!localLibrary) return;
      const videosWithoutThumbnails = localLibrary.filter(f => f.type === 'video' && !f.thumbnail && f.blob);
      
      for (const file of videosWithoutThumbnails) {
        if (file.blob instanceof File || file.blob instanceof Blob) {
          const thumbnail = await generateThumbnail(file.blob as File);
          if (thumbnail) {
            await dbLocal.mediaFiles.update(file.id!, { thumbnail });
          }
        }
      }
    };

    generateMissingThumbnails();
  }, [localLibrary]);

  // --- Auth & Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      return;
    }

    const q = query(collection(firestore, 'playlists'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Playlist));
      setPlaylists(p);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'playlists');
    });

    return () => unsubscribe();
  }, [user]);

  // --- Playback Logic ---
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (currentTrack?.blob) {
      const url = URL.createObjectURL(currentTrack.blob);
      setMediaUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setMediaUrl(null);
    }
  }, [currentTrack]);

  useEffect(() => {
    const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
    if (!media || !mediaUrl) return;

    if (isPlaying) {
      const playPromise = media.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') {
            console.error("Playback failed:", e);
            setIsPlaying(false);
          }
        });
      }
    } else {
      media.pause();
    }
  }, [isPlaying, mediaUrl, currentTrack?.type]);

  const handleTimeUpdate = () => {
    if (isSeeking) return;
    const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
    if (media) {
      const ct = media.currentTime;
      const d = media.duration;
      if (isFinite(ct)) setCurrentTime(ct);
      if (isFinite(d)) setDuration(d);
    }
  };

  const handleSeek = (val: number | number[]) => {
    const value = Array.isArray(val) ? val[0] : val;
    setIsSeeking(true);
    setCurrentTime(value);
  };

  const handleSeekCommit = (val: number | number[]) => {
    const value = Array.isArray(val) ? val[0] : val;
    const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
    if (media && isFinite(value)) {
      media.currentTime = value;
      setCurrentTime(value);
    }
    setIsSeeking(false);
  };

  const handleVolumeChange = (val: number | number[]) => {
    const value = Array.isArray(val) ? val[0] : val;
    if (isNaN(value) || !isFinite(value)) return;
    
    setVolume(value);
    const normalizedVolume = Math.max(0, Math.min(1, value / 100));
    
    // Update both refs to ensure volume is synced across audio/video
    if (audioRef.current) {
      audioRef.current.volume = normalizedVolume;
    }
    if (videoRef.current) {
      videoRef.current.volume = normalizedVolume;
    }
  };

  const playTrack = async (track: MediaFile) => {
    // Stop any currently playing media
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    if (currentTrack?.id === track.id) {
      if (track.type === 'audio') {
        setIsAudioExpanded(true);
      }
      setIsPlaying(true);
      return;
    }

    setCurrentTrack(track);
    setIsPlaying(true);
    setCurrentTime(0);
    
    if (track.type === 'audio') {
      setIsAudioExpanded(true);
    }
    
    // Update last played
    await dbLocal.mediaFiles.update(track.id!, { lastPlayed: new Date() });
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);
  const toggleRepeat = () => {
    const modes: ('none' | 'one' | 'all')[] = ['none', 'one', 'all'];
    const currentIndex = modes.indexOf(repeatMode);
    setRepeatMode(modes[(currentIndex + 1) % modes.length]);
  };

  const playNext = () => {
    if (!currentTrack || !localLibrary) return;
    if (repeatMode === 'one') {
      if (audioRef.current) audioRef.current.currentTime = 0;
      if (videoRef.current) videoRef.current.currentTime = 0;
      setIsPlaying(true);
      return;
    }
    
    // Filter library to stay within same media type
    const sameTypeLibrary = localLibrary.filter(t => t.type === currentTrack.type);
    if (sameTypeLibrary.length === 0) return;

    const currentIndex = sameTypeLibrary.findIndex(t => t.id === currentTrack.id);
    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * sameTypeLibrary.length);
    } else {
      nextIndex = (currentIndex + 1) % sameTypeLibrary.length;
    }
    const nextTrack = sameTypeLibrary[nextIndex];
    if (nextTrack) playTrack(nextTrack);
  };

  const playPrevious = () => {
    if (!currentTrack || !localLibrary) return;
    
    // Filter library to stay within same media type
    const sameTypeLibrary = localLibrary.filter(t => t.type === currentTrack.type);
    if (sameTypeLibrary.length === 0) return;

    const currentIndex = sameTypeLibrary.findIndex(t => t.id === currentTrack.id);
    const prevIndex = currentIndex <= 0 ? sameTypeLibrary.length - 1 : currentIndex - 1;
    const prevTrack = sameTypeLibrary[prevIndex];
    if (prevTrack) playTrack(prevTrack);
  };

  // --- File Handling ---
  const generateThumbnail = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 10);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(video.src);
          resolve(thumbnail);
        } else {
          URL.revokeObjectURL(video.src);
          resolve(undefined);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(undefined);
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: MediaFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');

      if (isAudio || isVideo) {
        const url = URL.createObjectURL(file);
        const media = document.createElement(isAudio ? 'audio' : 'video');
        media.src = url;
        
        const thumbnail = isVideo ? await generateThumbnail(file) : undefined;

        await new Promise((resolve) => {
          media.onloadedmetadata = () => {
            newFiles.push({
              title: file.name.replace(/\.[^/.]+$/, ""),
              artist: 'Unknown Artist',
              album: 'Unknown Album',
              duration: media.duration,
              fileName: file.name,
              fileSize: file.size,
              type: isAudio ? 'audio' : 'video',
              addedAt: new Date(),
              blob: file,
              thumbnail
            });
            URL.revokeObjectURL(url);
            resolve(null);
          };
          media.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
          };
        });
      }
    }

    if (newFiles.length > 0) {
      await dbLocal.mediaFiles.bulkAdd(newFiles);
      toast.success(`Added ${newFiles.length} files to library`);
    }
    
    if (e.target) {
      e.target.value = '';
    }
  };

  const clearHistory = async () => {
    const videoFiles = localLibrary?.filter(f => f.type === 'video' && f.lastPlayed) || [];
    if (videoFiles.length === 0) return;
    
    try {
      await Promise.all(videoFiles.map(file => 
        dbLocal.mediaFiles.update(file.id!, { lastPlayed: undefined })
      ));
      toast.success("History cleared");
    } catch (error) {
      console.error("Failed to clear history:", error);
      toast.error("Failed to clear history");
    }
  };

  const createPlaylist = async () => {
    if (!user) {
      toast.error("Please login to sync playlists");
      return;
    }

    if (!newPlaylistName.trim()) {
      toast.error("Please enter a playlist name");
      return;
    }

    try {
      await addDoc(collection(firestore, 'playlists'), {
        name: newPlaylistName.trim(),
        ownerId: user.uid,
        tracks: [],
        createdAt: serverTimestamp()
      });
      toast.success("Playlist created");
      setNewPlaylistName('');
      setIsPlaylistDialogOpen(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'playlists');
    }
  };

  const addToPlaylist = async (playlistId: string, track: MediaFile) => {
    if (!user) return;

    const trackData = {
      title: track.title,
      artist: track.artist,
      fileName: track.fileName,
      fileSize: track.fileSize,
      type: track.type,
      duration: track.duration
    };

    try {
      await updateDoc(doc(firestore, 'playlists', playlistId), {
        tracks: arrayUnion(trackData)
      });
      toast.success("Added to playlist");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `playlists/${playlistId}`);
    }
  };

  useEffect(() => {
    const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
    if (media) {
      media.volume = volume / 100;
    }
  }, [mediaUrl, volume]);

  useEffect(() => {
    setIsDiscSpinning(isPlaying && currentTrack?.type === 'audio');
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
        if (media) media.currentTime = Math.min(media.duration, media.currentTime + 5);
      } else if (e.code === 'ArrowLeft') {
        const media = currentTrack?.type === 'video' ? videoRef.current : audioRef.current;
        if (media) media.currentTime = Math.max(0, media.currentTime - 5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack]);

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden relative">
      <Toaster position="top-center" richColors />
      
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[70] w-64 bg-[#000] border-r border-white/10 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0",
        !isSidebarOpen ? "-translate-x-full" : "translate-x-0"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Music className="text-black w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">VibeSync</h1>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-white/50 hover:text-white" 
            onClick={() => setIsSidebarOpen(false)}
          >
            <Plus className="w-6 h-6 rotate-45" />
          </Button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <Button 
            variant={activeTab === 'music' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-3"
            onClick={() => { setActiveTab('music'); setIsSidebarOpen(false); }}
          >
            <Music className="w-4 h-4" /> Music
          </Button>
          <Button 
            variant={activeTab === 'videos' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-3"
            onClick={() => { setActiveTab('videos'); setIsSidebarOpen(false); }}
          >
            <Film className="w-4 h-4" /> Videos
          </Button>
          <Button 
            variant={activeTab === 'playlists' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-3"
            onClick={() => { setActiveTab('playlists'); setIsSidebarOpen(false); }}
          >
            <ListMusic className="w-4 h-4" /> Playlists
          </Button>
          <Button 
            variant={activeTab === 'search' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-3"
            onClick={() => { setActiveTab('search'); setIsSidebarOpen(false); }}
          >
            <Search className="w-4 h-4" /> Search
          </Button>
        </nav>

        <div className="p-4 border-t border-white/10">
          {user ? (
            <div className="flex items-center gap-3 p-2">
              <img src={user.photoURL || undefined} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <button onClick={logout} className="text-xs text-white/50 hover:text-white">Sign out</button>
              </div>
            </div>
          ) : (
            <Button onClick={loginWithGoogle} variant="outline" className="w-full gap-2">
              <User className="w-4 h-4" /> Sign In to Sync
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 h-full overflow-hidden">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-4 lg:px-8 gap-4 shrink-0 bg-[#0a0a0a] z-40">
          <div className="flex items-center gap-4 flex-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden text-white/70" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Library className="w-6 h-6" />
            </Button>
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input 
                placeholder="Search..." 
                className="pl-10 bg-white/5 border-none focus-visible:ring-orange-500 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              onChange={handleFileUpload} 
              accept="audio/*,video/*" 
              ref={fileInputRef}
            />
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 hidden sm:flex"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4" /> Add Files
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="sm:hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-40 lg:pb-24">
          <div className="p-4 lg:p-8">
            {(activeTab === 'music' || activeTab === 'videos' || activeTab === 'search') && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold capitalize">
                      {activeTab === 'search' ? 'Search Results' : activeTab}
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {filteredLibrary?.length || 0} items
                    </Badge>
                  </div>
                </div>

                {activeTab === 'videos' && localLibrary?.filter(f => f.type === 'video').length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <History className="w-5 h-5 text-orange-500" /> History
                      </h3>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-white/40 text-xs hover:text-white"
                        onClick={clearHistory}
                      >
                        Clear
                      </Button>
                    </div>
                    <ScrollArea className="w-full whitespace-nowrap">
                      <div className="flex gap-4 pb-4">
                        {localLibrary?.filter(f => f.type === 'video' && f.lastPlayed).sort((a, b) => (b.lastPlayed?.getTime() || 0) - (a.lastPlayed?.getTime() || 0)).slice(0, 5).map(file => (
                          <div 
                            key={`hist-${file.id}`} 
                            className="w-48 shrink-0 cursor-pointer group"
                            onClick={() => playTrack(file)}
                          >
                            <div className="aspect-video bg-white/5 rounded-lg mb-2 relative overflow-hidden">
                              {file.thumbnail ? (
                                <img src={file.thumbnail} alt={file.title} className="w-full h-full object-cover" />
                              ) : (
                                <Film className="w-8 h-8 text-white/10 absolute inset-0 m-auto" />
                              )}
                              <div className="absolute bottom-1 right-1 bg-black/60 text-[10px] px-1 rounded text-white">
                                {Math.floor(file.duration / 60)}:{Math.floor(file.duration % 60).toString().padStart(2, '0')}
                              </div>
                            </div>
                            <p className="text-xs font-medium truncate">{file.title}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {activeTab === 'videos' && (
                  <div className="flex items-center gap-6 border-b border-white/5 pb-2">
                    <button 
                      onClick={() => setVideoSubTab('video')}
                      className={cn(
                        "text-sm pb-2 transition-colors",
                        videoSubTab === 'video' ? "text-orange-500 font-bold border-b-2 border-orange-500" : "text-white/40 font-medium"
                      )}
                    >
                      Video
                    </button>
                    <button 
                      onClick={() => setVideoSubTab('folder')}
                      className={cn(
                        "text-sm pb-2 transition-colors",
                        videoSubTab === 'folder' ? "text-orange-500 font-bold border-b-2 border-orange-500" : "text-white/40 font-medium"
                      )}
                    >
                      Folder
                    </button>
                    <button 
                      onClick={() => setVideoSubTab('playlist')}
                      className={cn(
                        "text-sm pb-2 transition-colors",
                        videoSubTab === 'playlist' ? "text-orange-500 font-bold border-b-2 border-orange-500" : "text-white/40 font-medium"
                      )}
                    >
                      Playlist
                    </button>
                  </div>
                )}

                {activeTab === 'search' && filteredLibrary?.length === 0 && (
                  <div className="text-center py-12 text-white/30">
                    No matches found for "{searchQuery}"
                  </div>
                )}

                {activeTab === 'videos' && videoSubTab === 'folder' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    <div className="flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-full aspect-square bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-white/10 transition-colors relative">
                        <FolderOpen className="w-12 h-12 text-orange-500" />
                        <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                          <Download className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-sm">Download</p>
                        <p className="text-[10px] text-white/40">{localLibrary?.filter(f => f.type === 'video').length || 0} videos</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'videos' && videoSubTab === 'playlist' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playlists.length === 0 ? (
                      <div className="col-span-full py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <ListMusic className="w-12 h-12 text-white/20 mx-auto mb-4" />
                        <p className="text-white/50">No video playlists yet</p>
                        <Button variant="link" className="text-orange-500" onClick={() => setIsPlaylistDialogOpen(true)}>Create one</Button>
                      </div>
                    ) : (
                      playlists.map(playlist => (
                        <div key={playlist.id} className="p-4 bg-white/5 rounded-xl flex items-center gap-4 hover:bg-white/10 transition-colors cursor-pointer">
                          <div className="w-16 h-16 bg-orange-500/20 rounded-lg flex items-center justify-center">
                            <ListMusic className="w-8 h-8 text-orange-500" />
                          </div>
                          <div>
                            <h4 className="font-bold">{playlist.name}</h4>
                            <p className="text-xs text-white/40">{playlist.tracks.filter(t => t.type === 'video').length} videos</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {((activeTab === 'videos' && videoSubTab === 'video') || activeTab === 'search' || activeTab === 'music') && (
                  <div className={cn(
                    "grid gap-4",
                    activeTab === 'videos' ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  )}>
                    {filteredLibrary?.map((file) => (
                      <motion.div 
                        key={file.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "group transition-colors cursor-pointer",
                          activeTab === 'videos' ? "flex gap-4 p-2 rounded-xl hover:bg-white/5" : "p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent"
                        )}
                        onClick={() => playTrack(file)}
                      >
                        <div className={cn(
                          "bg-white/5 rounded-lg flex items-center justify-center relative overflow-hidden shrink-0",
                          activeTab === 'videos' ? "w-32 sm:w-40 aspect-video" : "aspect-square mb-4"
                        )}>
                          {file.thumbnail ? (
                            <img src={file.thumbnail} alt={file.title} className="w-full h-full object-cover" />
                          ) : (
                            file.type === 'audio' ? (
                              <Music className="w-12 h-12 text-white/20" />
                            ) : (
                              <Film className="w-12 h-12 text-white/20" />
                            )
                          )}
                          {file.type === 'video' && (
                            <div className="absolute bottom-1 right-1 bg-black/60 text-[10px] px-1 rounded text-white">
                              {Math.floor(file.duration / 60)}:{Math.floor(file.duration % 60).toString().padStart(2, '0')}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                              {currentTrack?.id === file.id && isPlaying ? <Pause className="text-black fill-black" /> : <Play className="text-black fill-black ml-1" />}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h3 className="font-semibold truncate text-sm sm:text-base">{file.title}</h3>
                          {activeTab === 'videos' ? (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-white/30">720p | {(file.fileSize / (1024 * 1024)).toFixed(2)}MB</span>
                              <Badge variant="outline" className="text-[8px] h-4 px-1 border-white/10 text-white/40">
                                <Download className="w-2 h-2 mr-1" /> Download
                              </Badge>
                            </div>
                          ) : (
                            <p className="text-sm text-white/50 truncate">{file.artist}</p>
                          )}
                          {activeTab !== 'videos' && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-white/30">{Math.floor(file.duration / 60)}:{Math.floor(file.duration % 60).toString().padStart(2, '0')}</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger 
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 text-white">
                                  <DropdownMenuItem onClick={() => dbLocal.mediaFiles.delete(file.id!)}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Remove
                                  </DropdownMenuItem>
                                  {playlists.map(p => (
                                    <DropdownMenuItem key={p.id} onClick={() => addToPlaylist(p.id, file)}>
                                      <Plus className="w-4 h-4 mr-2" /> Add to {p.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                        
                        {activeTab === 'videos' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger 
                              onClick={(e) => e.stopPropagation()}
                              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 self-center"
                            >
                              <MoreVertical className="w-5 h-5 text-white/40" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 text-white">
                              <DropdownMenuItem onClick={() => dbLocal.mediaFiles.delete(file.id!)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Playlists</h2>
                  <Button onClick={() => setIsPlaylistDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-black">
                    <Plus className="w-4 h-4 mr-2" /> New Playlist
                  </Button>
                </div>

                {!user && (
                  <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <Cloud className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Sync your playlists</h3>
                    <p className="text-white/50 mb-6">Sign in to access your playlists across all your devices.</p>
                    <Button onClick={loginWithGoogle}>Sign In with Google</Button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {playlists.map(playlist => (
                    <div key={playlist.id} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/50 transition-colors group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold">{playlist.name}</h3>
                          <p className="text-sm text-white/50">{playlist.tracks.length} tracks</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc(firestore, 'playlists', playlist.id))}>
                          <Trash2 className="w-4 h-4 text-white/30 hover:text-red-500" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {playlist.tracks.slice(0, 3).map((t, i) => (
                          <div key={i} className="text-sm text-white/40 truncate flex items-center gap-2">
                            <div className="w-1 h-1 bg-white/20 rounded-full" />
                            {t.title}
                          </div>
                        ))}
                        {playlist.tracks.length > 3 && (
                          <p className="text-xs text-white/20">+{playlist.tracks.length - 3} more</p>
                        )}
                      </div>
                      <Button variant="secondary" className="w-full mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Playlist
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-24 left-0 right-0 h-16 bg-[#050505] border-t border-white/10 flex items-center justify-around z-50">
          <button 
            onClick={() => setActiveTab('videos')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'videos' ? 'text-orange-500' : 'text-white/40'}`}
          >
            <Film className="w-5 h-5" />
            <span className="text-[10px]">VIDEO</span>
          </button>
          <button 
            onClick={() => setActiveTab('music')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'music' ? 'text-orange-500' : 'text-white/40'}`}
          >
            <Music className="w-5 h-5" />
            <span className="text-[10px]">MUSIC</span>
          </button>
          <button 
            onClick={() => setActiveTab('playlists')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'playlists' ? 'text-orange-500' : 'text-white/40'}`}
          >
            <ListMusic className="w-5 h-5" />
            <span className="text-[10px]">PLAYLIST</span>
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'search' ? 'text-orange-500' : 'text-white/40'}`}
          >
            <Search className="w-5 h-5" />
            <span className="text-[10px]">SEARCH</span>
          </button>
        </div>

        {/* Video Player Overlay */}
        <AnimatePresence>
          {currentTrack?.type === 'video' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseMove={handleMouseMove}
              className={cn(
                "fixed inset-0 z-[110] bg-black flex flex-col overflow-hidden",
                !showControls && isPlaying ? "cursor-none" : "cursor-default"
              )}
            >
              {/* Top Bar */}
              <div className={cn(
                "absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-4 z-20 transition-opacity duration-500",
                (showControls || !isPlaying) && !isLocked ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-white bg-white/10 hover:bg-white/20 rounded-full" 
                    onClick={() => setCurrentTrack(null)}
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </Button>
                  <h2 className="text-white font-medium truncate text-sm sm:text-base">{currentTrack.title}</h2>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button variant="ghost" size="icon" className="text-white h-9 w-9"><Zap className="w-5 h-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-white h-9 w-9"><Subtitles className="w-5 h-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-white h-9 w-9"><Headphones className="w-5 h-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-white h-9 w-9"><ListMusic className="w-5 h-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-white h-9 w-9"><MoreVertical className="w-5 h-5" /></Button>
                </div>
              </div>

              {/* Side Controls */}
              <div className={cn(
                "absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20 transition-opacity duration-500",
                (showControls || !isPlaying) ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="bg-black/20 hover:bg-black/40 text-white rounded-full h-10 w-10 backdrop-blur-sm"
                  onClick={() => setIsLocked(!isLocked)}
                >
                  {isLocked ? <Lock className="w-5 h-5 text-orange-500" /> : <Unlock className="w-5 h-5" />}
                </Button>
                {!isLocked && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="bg-black/20 hover:bg-black/40 text-white rounded-full h-10 w-10 backdrop-blur-sm"
                    onClick={() => handleVolumeChange([volume === 0 ? 80 : 0])}
                  >
                    {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </Button>
                )}
              </div>

              {!isLocked && (
                <div className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20 transition-opacity duration-500",
                  (showControls || !isPlaying) ? "opacity-100" : "opacity-0 pointer-events-none"
                )}>
                  <Button variant="ghost" size="icon" className="bg-black/20 hover:bg-black/40 text-white rounded-full h-10 w-10 backdrop-blur-sm">
                    <Scissors className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="bg-black/20 hover:bg-black/40 text-white rounded-full h-10 w-10 backdrop-blur-sm">
                    <Monitor className="w-5 h-5" />
                  </Button>
                </div>
              )}

              {/* Video Content */}
              <div className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={handleVideoClick}>
                <video 
                  ref={videoRef}
                  src={mediaUrl || undefined}
                  className={cn(
                    "transition-all duration-300",
                    aspectRatio === 'fit' ? "max-w-full max-h-full object-contain" : 
                    aspectRatio === 'fill' ? "w-full h-full object-cover" : 
                    "w-full h-full object-fill"
                  )}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={playNext}
                />
                
                {/* Center Play/Pause Overlay */}
                <AnimatePresence>
                  {!isPlaying && !isLocked && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <Play className="w-10 h-10 text-white fill-white ml-1" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Controls */}
              <div className={cn(
                "absolute inset-x-0 bottom-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-500 z-20",
                (showControls || !isPlaying) && !isLocked ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
                <div className="space-y-4 max-w-6xl mx-auto">
                  <div className="flex items-center gap-3 px-2">
                    <span className="text-[10px] sm:text-xs font-mono text-white/70">
                      {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                    </span>
                    <Slider 
                      value={[currentTime]} 
                      max={duration || 100} 
                      step={0.1}
                      variant="green"
                      onValueChange={handleSeek}
                      onValueCommitted={handleSeekCommit}
                      className="flex-1"
                    />
                    <span className="text-[10px] sm:text-xs font-mono text-white/70">
                      -{Math.floor((duration - currentTime) / 60)}:{Math.floor((duration - currentTime) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 sm:gap-8">
                      <Button variant="ghost" size="icon" className="text-white h-12 w-12" onClick={() => setIsPlaying(!isPlaying)}>
                        {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white h-10 w-10" onClick={playPrevious}>
                        <SkipBack className="w-6 h-6 fill-current" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white h-10 w-10" onClick={playNext}>
                        <SkipForward className="w-6 h-6 fill-current" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-6">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-white text-xs font-bold hover:bg-white/10 px-3"
                        onClick={togglePlaybackSpeed}
                      >
                        Speed {playbackSpeed}x
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-white h-10 w-10"
                        onClick={toggleAspectRatio}
                      >
                        <Maximize className="w-5 h-5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-white h-10 w-10"
                        onClick={() => {
                          const container = videoRef.current?.parentElement;
                          if (document.fullscreenElement) {
                            document.exitFullscreen();
                          } else {
                            container?.requestFullscreen();
                          }
                        }}
                      >
                        <Monitor className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden Audio Element */}
        <audio 
          ref={audioRef}
          src={currentTrack?.type === 'audio' ? (mediaUrl || undefined) : undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={playNext}
        />

        {/* Player Bar */}
        <footer className="fixed bottom-0 left-0 right-0 h-24 bg-[#050505] border-t border-white/10 px-4 lg:px-8 flex items-center gap-4 lg:gap-8 z-[60]">
          <div className="flex items-center gap-3 lg:gap-4 w-1/2 lg:w-1/4">
            {currentTrack ? (
              <>
                <div 
                  className="w-12 h-12 lg:w-14 lg:h-14 bg-white/5 rounded-full flex items-center justify-center overflow-hidden cursor-pointer group/art shrink-0 relative"
                  onClick={() => currentTrack.type === 'audio' && setIsAudioExpanded(true)}
                >
                  {currentTrack.type === 'audio' ? (
                    <div className={`w-full h-full flex items-center justify-center ${isDiscSpinning ? 'animate-spin-slow' : ''}`}>
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center border border-white/10">
                        <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                          <div className="w-1 h-1 rounded-full bg-orange-500" />
                        </div>
                      </div>
                    </div>
                  ) : <Film className="w-5 h-5 lg:w-6 lg:h-6 text-white/40" />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="font-medium truncate text-sm lg:text-base">{currentTrack.title}</h4>
                  <p className="text-[10px] lg:text-xs text-white/50 truncate">{currentTrack.artist}</p>
                </div>
              </>
            ) : (
              <div className="text-white/20 text-xs lg:text-sm italic">No track</div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 lg:gap-2 max-w-2xl hidden sm:flex">
            <div className="flex items-center gap-4 lg:gap-6">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white/50 hover:text-white"
                onClick={playPrevious}
                disabled={!currentTrack}
              >
                <SkipBack className="w-4 h-4 lg:w-5 lg:h-5 fill-current" />
              </Button>
              <Button 
                size="icon" 
                className="w-8 h-8 lg:w-10 lg:h-10 bg-white text-black hover:bg-white/90 rounded-full"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={!currentTrack}
              >
                {isPlaying ? <Pause className="w-4 h-4 lg:w-5 lg:h-5 fill-current" /> : <Play className="w-4 h-4 lg:w-5 lg:h-5 fill-current ml-0.5 lg:ml-1" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white/50 hover:text-white"
                onClick={playNext}
                disabled={!currentTrack}
              >
                <SkipForward className="w-4 h-4 lg:w-5 lg:h-5 fill-current" />
              </Button>
            </div>
            <div className="w-full flex items-center gap-2 lg:gap-3">
              <span className="text-[9px] lg:text-[10px] text-white/40 w-8 lg:w-10 text-right">
                {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
              </span>
              <Slider 
                value={[currentTime]} 
                max={duration || 100} 
                step={0.1}
                variant={currentTrack?.type === 'video' ? 'green' : 'orange'}
                onValueChange={handleSeek}
                onValueCommitted={handleSeekCommit}
                className="flex-1"
              />
              <span className="text-[9px] lg:text-[10px] text-white/40 w-8 lg:w-10">
                {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Mobile Mini Controls */}
          <div className="flex sm:hidden items-center gap-2 ml-auto">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!currentTrack}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white/40"
              onClick={() => setCurrentTrack(null)}
            >
              <Plus className="w-6 h-6 rotate-45" />
            </Button>
          </div>

          <div className="w-1/4 hidden lg:flex items-center justify-end gap-4">
            <div className="flex items-center gap-2 w-32">
              {volume === 0 ? <VolumeX className="w-4 h-4 text-white/40" /> : <Volume2 className="w-4 h-4 text-white/40" />}
              <Slider 
                value={[volume]} 
                max={100} 
                variant="orange"
                onValueChange={handleVolumeChange}
                className="flex-1"
              />
            </div>
          </div>
        </footer>
      </main>

      {/* Audio Expanded Overlay */}
      <AnimatePresence>
        {isAudioExpanded && currentTrack && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[120] bg-[#050505] flex flex-col"
          >
            {/* Expanded Header */}
            <div className="h-20 px-6 flex items-center justify-between shrink-0">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white/70"
                onClick={() => setIsAudioExpanded(false)}
              >
                <ChevronDown className="w-8 h-8" />
              </Button>
              <div className="text-center flex-1 px-4 overflow-hidden">
                <h2 className="text-lg font-bold truncate">{currentTrack.title}</h2>
                <p className="text-xs text-white/40 truncate">{currentTrack.artist}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-white/70">
                <Share2 className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 overflow-y-auto">
              <div className="w-full max-w-lg flex flex-col items-center gap-8 lg:gap-12">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full max-w-[280px] lg:max-w-sm aspect-square bg-white/5 rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden border-8 border-white/5"
                >
                  <div className={`w-full h-full flex items-center justify-center ${isDiscSpinning ? 'animate-spin-slow' : ''}`}>
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-800 via-black to-gray-900 flex items-center justify-center border-4 border-white/10 relative">
                      {/* Vinyl Grooves */}
                      <div className="absolute inset-4 rounded-full border border-white/5" />
                      <div className="absolute inset-8 rounded-full border border-white/5" />
                      <div className="absolute inset-12 rounded-full border border-white/5" />
                      
                      {/* Center Label */}
                      <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-orange-500 flex items-center justify-center shadow-inner">
                        <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full bg-black/20 flex items-center justify-center">
                          <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-white/80" />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {isPlaying && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="w-full h-full bg-orange-500/5 animate-pulse" />
                    </div>
                  )}
                </motion.div>

                <div className="w-full space-y-8">
                  <div className="space-y-2">
                    <Slider 
                      value={[currentTime]} 
                      max={duration || 100} 
                      step={0.1}
                      variant="orange"
                      onValueChange={handleSeek}
                      onValueCommitted={handleSeekCommit}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-white/40 font-mono">
                      <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
                      <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 w-full max-w-md mx-auto">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn("w-10 h-10", repeatMode !== 'none' ? "text-orange-500" : "text-white/30")}
                      onClick={toggleRepeat}
                    >
                      <Repeat className="w-5 h-5" />
                      {repeatMode === 'one' && <span className="absolute text-[8px] font-bold mt-3">1</span>}
                    </Button>
                    
                    <div className="flex items-center gap-6 sm:gap-10">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-12 h-12 text-white/70 hover:text-white flex items-center justify-center"
                        onClick={playPrevious}
                      >
                        <SkipBack className="w-7 h-7 fill-current" />
                      </Button>
                      <Button 
                        size="icon" 
                        className="w-16 h-16 bg-white text-black hover:bg-white/90 rounded-full shadow-xl flex items-center justify-center"
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-12 h-12 text-white/70 hover:text-white flex items-center justify-center"
                        onClick={playNext}
                      >
                        <SkipForward className="w-7 h-7 fill-current" />
                      </Button>
                    </div>

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn("w-10 h-10", isShuffle ? "text-orange-500" : "text-white/30")}
                      onClick={toggleShuffle}
                    >
                      <Shuffle className="w-5 h-5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 max-w-xs mx-auto pt-4">
                    {volume === 0 ? <VolumeX className="w-4 h-4 text-white/30" /> : <Volume2 className="w-4 h-4 text-white/30" />}
                    <Slider 
                      value={[volume]} 
                      max={100} 
                      variant="orange"
                      onValueChange={handleVolumeChange}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist Dialog */}
      <Dialog open={isPlaylistDialogOpen} onOpenChange={setIsPlaylistDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Create New Playlist</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Playlist Name" 
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="bg-white/5 border-white/10"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPlaylistDialogOpen(false)}>Cancel</Button>
            <Button onClick={createPlaylist} className="bg-orange-500 text-black hover:bg-orange-600">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
