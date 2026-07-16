import { useEffect, useState, useRef } from "react";
import { useStore } from "./store";
import "./App.css";
import {
  Search,
  Download,
  Settings,
  Trash2,
  X,
  CheckCircle,
  RefreshCw,
  Globe,
  Clock,
  Video,
  AlertOctagon,
  ArrowRight,
  FolderOpen,
  Plus,
  Play,
  Database,
  Sliders,
  FileText,
  Heart,
  Scissors,
  FileDown,
  Lock,
  Sparkles,
  Zap,
  ChevronUp,
  ChevronDown,
  List
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

// Helper to format duration (seconds to hh:mm:ss)
function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Helper to format milliseconds to mm:ss or hh:mm:ss
function formatTimeMs(ms: number): string {
  return formatDuration(ms / 1000);
}

// Live preview template builder helper
function getTemplatePreview(template: string): string {
  return template
    .replace("%(title)s", "Rick Astley - Never Gonna Give You Up")
    .replace("%(id)s", "dQw4w9WgXcQ")
    .replace("%(uploader)s", "Rick Astley")
    .replace("%(upload_date)s", "20091025")
    .replace("%(ext)s", "mp4")
    .replace("%(resolution)s", "1080p")
    .replace("%(playlist_index)s", "1");
}

export default function App() {
  const {
    downloads,
    metadataPreview,
    metadataLoading,
    metadataError,
    
    playlistPreview,
    playlistLoading,
    playlistError,

    library,
    librarySearchQuery,
    librarySearchResults,
    libraryLoading,

    subscriptions,
    subscriptionsLoading,

    settings,
    binaryVersions,
    whisperStatus,
    whisperProgress,
    updateStatus,
    ffmpegAvailable,

    fetchMetadata,
    fetchPlaylistMetadata,
    clearMetadata,
    clearPlaylistMetadata,
    queueDownload,
    cancelDownload,
    clearHistory,
    loadSettings,
    saveSettings,
    checkUpdates,
    performUpdates,
    installPlugin,

    loadSubscriptions,
    addSubscription,
    deleteSubscription,
    checkSubscriptions,

    loadLibrary,
    deleteLibraryItem,
    searchLibrary,
    clearLibrarySearch,
    setupWhisperBinary,
    setupWhisperModel,
    transcribeVideo
  } = useStore();

  const [url, setUrl] = useState("");
  const [formatId, setFormatId] = useState("best");
  const [activeTab, setActiveTab] = useState<"downloader" | "library" | "search" | "subscriptions">("downloader");
  const [showSettings, setShowSettings] = useState(false);
  
  // Playlist selection
  const [selectedPlaylistVideoIds, setSelectedPlaylistVideoIds] = useState<string[]>([]);
  
  // Download options
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState("00:00:00");
  const [trimEnd, setTrimEnd] = useState("00:01:00");
  const [optInTranscribe, setOptInTranscribe] = useState(false);
  
  // Subtitles download configuration
  const [selectedSubLangs, setSelectedSubLangs] = useState<string[]>([]);
  const [embedSubs, setEmbedSubs] = useState(false);
  const [writeSubs, setWriteSubs] = useState(true);
  const [writeAutoSubs, setWriteAutoSubs] = useState(false);

  // Subscriptions input
  const [subUrl, setSubUrl] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [subType, setSubType] = useState("channel");

  // Search input
  const [searchQueryLocal, setSearchQueryLocal] = useState("");

  // Video Player Modal
  const [activePlayerVideo, setActivePlayerVideo] = useState<{ filePath: string; title: string; jumpTimeMs?: number } | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Settings local state
  const [checkingUpdatesLocal, setCheckingUpdatesLocal] = useState(false);
  const [pluginInstalling, setPluginInstalling] = useState(false);
  const [pluginMessage, setPluginMessage] = useState("");

  // Initialize
  useEffect(() => {
    loadSettings();
  }, []);

  // Set up deep linking
  useEffect(() => {
    // Check deep link triggers on load
    getCurrent()
      .then((urls) => {
        if (urls && urls.length > 0) {
          handleIncomingDeepLink(urls[0]);
        }
      })
      .catch((err) => console.error("Tauri getCurrent link failed", err));

    // Handle deep links while running
    let unlistenOpenUrl: any;
    onOpenUrl((urls) => {
      if (urls && urls.length > 0) {
        handleIncomingDeepLink(urls[0]);
      }
    }).then((u) => {
      unlistenOpenUrl = u;
    });

    // Listen for single-instance secondary launches (Windows arguments)
    const unlistenSingleInstance = listen<string[]>("single-instance", (event) => {
      const args = event.payload;
      const urlArg = args.find((arg) => arg.startsWith("vidralo://"));
      if (urlArg) {
        handleIncomingDeepLink(urlArg);
      }
    });

    return () => {
      if (unlistenOpenUrl) unlistenOpenUrl();
      unlistenSingleInstance.then((u) => u());
    };
  }, []);

  // Jump player timestamp when modal loads
  useEffect(() => {
    if (activePlayerVideo?.jumpTimeMs && videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = activePlayerVideo.jumpTimeMs / 1000;
    }
  }, [activePlayerVideo]);

  const handleIncomingDeepLink = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      const videoUrl = parsed.searchParams.get("url");
      if (videoUrl) {
        setUrl(videoUrl);
        setActiveTab("downloader");
        fetchMetadata(videoUrl);
      }
    } catch (e) {
      console.error("Failed to parse incoming deep link", e);
    }
  };

  const handleFetchMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // Check if it is a playlist/channel URL
    const isPlaylist = url.includes("playlist?list=") || url.includes("/channel/") || url.includes("/c/") || url.includes("/user/") || url.includes("/playlist");
    if (isPlaylist) {
      fetchPlaylistMetadata(url.trim());
    } else {
      fetchMetadata(url.trim());
    }
  };

  const handleQueueDownload = () => {
    if (!metadataPreview) return;
    
    queueDownload({
      url: url.trim(),
      title: metadataPreview.title,
      thumbnail: metadataPreview.thumbnail,
      uploader: metadataPreview.uploader,
      duration: metadataPreview.duration,
      format: formatId,
      trimRange: trimEnabled ? `${trimStart}-${trimEnd}` : undefined,
      subLangs: selectedSubLangs.length > 0 ? selectedSubLangs : undefined,
      writeSubs: selectedSubLangs.length > 0 ? writeSubs : undefined,
      writeAutoSubs: selectedSubLangs.length > 0 ? writeAutoSubs : undefined,
      embedSubs: selectedSubLangs.length > 0 ? embedSubs : undefined,
      transcribe: optInTranscribe,
    });
    
    // Reset options
    clearMetadata();
    setUrl("");
    setTrimEnabled(false);
    setSelectedSubLangs([]);
  };

  const handleQueuePlaylist = () => {
    if (!playlistPreview) return;
    
    const selectedEntries = playlistPreview.entries.filter((entry) =>
      selectedPlaylistVideoIds.includes(entry.id)
    );
    
    selectedEntries.forEach((entry) => {
      queueDownload({
        url: entry.url,
        title: entry.title,
        thumbnail: "",
        uploader: entry.uploader,
        duration: entry.duration,
        format: formatId,
        transcribe: optInTranscribe,
      });
    });
    
    clearPlaylistMetadata();
    setUrl("");
    setSelectedPlaylistVideoIds([]);
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subUrl.trim() || !subTitle.trim()) return;
    
    try {
      await addSubscription(subUrl.trim(), subTitle.trim(), subType);
      setSubUrl("");
      setSubTitle("");
    } catch (err: any) {
      alert("Failed to subscribe: " + err.message);
    }
  };

  const handleSearchLocal = (e: React.FormEvent) => {
    e.preventDefault();
    searchLibrary(searchQueryLocal);
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdatesLocal(true);
    await checkUpdates();
    setCheckingUpdatesLocal(false);
  };

  const handleInstallPlugin = async () => {
    setPluginInstalling(true);
    setPluginMessage("Downloading plugin ChromeCookieUnlock...");
    try {
      await installPlugin("ChromeCookieUnlock");
      setPluginMessage("Plugin ChromeCookieUnlock installed successfully!");
    } catch (err: any) {
      setPluginMessage("Failed to install plugin: " + err.message);
    }
    setPluginInstalling(false);
  };

  const reorderQueue = (index: number, direction: "up" | "down") => {
    const updated = [...downloads];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= updated.length) return;
    
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    
    // Save to store
    useStore.setState({ downloads: updated });
    localStorage.setItem("vidralo_downloads", JSON.stringify(updated));
  };

  return (
    <div className="h-screen bg-bg-dark text-gray-100 flex flex-col font-sans select-none overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-25%] left-[-15%] w-[60%] h-[60%] bg-brand-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[60%] bg-rose-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header */}
      <header className="h-16 border-b border-panel-border glass flex items-center justify-between px-6 z-25 no-select shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-700 to-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Download className="w-5 h-5 text-white animate-pulse-slow" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Vidralo
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase">
              Local-First Downloader
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex gap-1 bg-white/5 border border-white/5 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("downloader")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "downloader" ? "bg-brand-500 text-white shadow-md shadow-brand-500/15" : "text-gray-400 hover:text-white"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Downloader
          </button>
          <button
            onClick={() => {
              setActiveTab("library");
              loadLibrary();
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "library" ? "bg-brand-500 text-white shadow-md shadow-brand-500/15" : "text-gray-400 hover:text-white"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            onClick={() => {
              setActiveTab("search");
              clearLibrarySearch();
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "search" ? "bg-brand-500 text-white shadow-md shadow-brand-500/15" : "text-gray-400 hover:text-white"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Search
          </button>
          <button
            onClick={() => {
              setActiveTab("subscriptions");
              loadSubscriptions();
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "subscriptions" ? "bg-brand-500 text-white shadow-md shadow-brand-500/15" : "text-gray-400 hover:text-white"
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            Subscriptions
          </button>
        </nav>

        {/* Right side config buttons */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400 bg-white/5 border border-white/5 rounded-full px-3 py-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span>yt-dlp {binaryVersions.yt_dlp}</span>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center transition-all cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-gray-300" />
          </button>
        </div>
      </header>

      {/* Main Views Container */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        
        {/* VIEW: DOWNLOADER */}
        {activeTab === "downloader" && (
          <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
            {/* Input & Form */}
            <section className="col-span-5 flex flex-col gap-6 overflow-y-auto pr-1">
              <div className="glass rounded-2xl p-5 flex flex-col gap-4 shadow-xl shrink-0">
                <h2 className="font-bold text-xs tracking-wide text-gray-400 uppercase">
                  Paste URL
                </h2>
                <form onSubmit={handleFetchMetadata} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Paste video/playlist URL (YouTube, TikTok, X, etc.)"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full h-11 px-4 pr-10 rounded-xl glass-input text-sm text-gray-200"
                    />
                    <button
                      type="submit"
                      disabled={metadataLoading || playlistLoading}
                      className="absolute right-2 top-1.5 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all disabled:opacity-50"
                    >
                      {metadataLoading || playlistLoading ? (
                        <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 text-gray-300" />
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Extraction / Loading Status */}
              {(metadataLoading || playlistLoading) && (
                <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
                    <Globe className="w-5 h-5 text-brand-500 absolute animate-pulse" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-200">Analyzing resource...</p>
                    <p className="text-xs text-gray-500 mt-1">Retrieving stream attributes and sub configurations</p>
                  </div>
                </div>
              )}

              {/* Error messages */}
              {(metadataError || playlistError) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                    <AlertOctagon className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-red-200">Extraction Failed</p>
                    <p className="text-xs text-red-400/80 mt-1 leading-relaxed">{metadataError || playlistError}</p>
                    <button
                      onClick={() => fetchMetadata(url)}
                      className="mt-3 text-xs text-red-200 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      Retry analysis <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Single Video Preview Card */}
              {metadataPreview && (
                <div className="glass rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-white/5 animate-fade-in">
                  <div className="aspect-video w-full bg-black/40 relative overflow-hidden group">
                    <img
                      src={metadataPreview.thumbnail || "/placeholder.jpg"}
                      alt={metadataPreview.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                      {formatDuration(metadataPreview.duration)}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col gap-4">
                    <div>
                      <h3 className="font-bold text-sm text-gray-200 leading-snug line-clamp-2">
                        {metadataPreview.title}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium mt-1">
                        {metadataPreview.uploader}
                      </p>
                    </div>

                    {/* Formats Dropdown */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Format & Resolution
                      </label>
                      <select
                        value={formatId}
                        onChange={(e) => setFormatId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 focus:border-brand-500/50 text-xs text-gray-300 outline-none cursor-pointer"
                      >
                        <option value="best" className="bg-panel-dark">Best Quality (Auto-Merge)</option>
                        <option value="1080p" className="bg-panel-dark">1080p (FHD, Auto-Merge)</option>
                        <option value="720p" className="bg-panel-dark">720p (HD)</option>
                        <option value="480p" className="bg-panel-dark">480p (SD)</option>
                        <option value="mp3" className="bg-panel-dark">MP3 Audio Only (128kbps)</option>
                        <option value="m4a" className="bg-panel-dark">M4A Audio Only</option>
                      </select>
                    </div>

                    {/* Clip Trimming Panel */}
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1">
                          <Scissors className="w-3.5 h-3.5 text-gray-400" />
                          Download Only a Clip
                        </span>
                        <input
                          type="checkbox"
                          checked={trimEnabled}
                          onChange={(e) => setTrimEnabled(e.target.checked)}
                          className="cursor-pointer accent-brand-500"
                        />
                      </div>
                      {trimEnabled && (
                        <div className="grid grid-cols-2 gap-3 mt-1.5 animate-fade-in">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] text-gray-500 uppercase font-semibold">Start Time</span>
                            <input
                              type="text"
                              value={trimStart}
                              onChange={(e) => setTrimStart(e.target.value)}
                              className="h-8 px-2 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-center"
                              placeholder="00:00:00"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] text-gray-500 uppercase font-semibold">End Time</span>
                            <input
                              type="text"
                              value={trimEnd}
                              onChange={(e) => setTrimEnd(e.target.value)}
                              className="h-8 px-2 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-center"
                              placeholder="00:01:00"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Subtitle Panel */}
                    {(metadataPreview.subtitles.length > 0 || metadataPreview.auto_subs.length > 0) && (
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
                        <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          Subtitle Languages Available
                        </span>
                        
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto border border-white/5 rounded-lg p-2 bg-black/20">
                          {metadataPreview.subtitles.map((lang) => (
                            <button
                              key={`sub-${lang}`}
                              onClick={() => {
                                if (selectedSubLangs.includes(lang)) {
                                  setSelectedSubLangs(selectedSubLangs.filter(l => l !== lang));
                                } else {
                                  setSelectedSubLangs([...selectedSubLangs, lang]);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                selectedSubLangs.includes(lang) ? "bg-brand-500 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                              }`}
                            >
                              {lang} (Official)
                            </button>
                          ))}
                          {metadataPreview.auto_subs.map((lang) => (
                            <button
                              key={`auto-${lang}`}
                              onClick={() => {
                                if (selectedSubLangs.includes(lang)) {
                                  setSelectedSubLangs(selectedSubLangs.filter(l => l !== lang));
                                } else {
                                  setSelectedSubLangs([...selectedSubLangs, lang]);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                selectedSubLangs.includes(lang) ? "bg-brand-600/50 text-white" : "bg-white/5 text-gray-500 hover:text-white"
                              }`}
                            >
                              {lang} (Auto)
                            </button>
                          ))}
                        </div>

                        {selectedSubLangs.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mt-1 animate-fade-in text-[10px] text-gray-400">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={embedSubs}
                                onChange={(e) => setEmbedSubs(e.target.checked)}
                              />
                              Embed Subs
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={writeSubs}
                                onChange={(e) => setWriteSubs(e.target.checked)}
                              />
                              Save files
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={writeAutoSubs}
                                onChange={(e) => setWriteAutoSubs(e.target.checked)}
                              />
                              Auto-subs
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transcription Toggle */}
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                          Transcribe Video for Search
                        </span>
                        <span className="text-[9px] text-gray-500 mt-0.5">Index transcript audio for FTS search</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={optInTranscribe}
                        disabled={!whisperStatus.binary_available || !whisperStatus.model_available}
                        onChange={(e) => setOptInTranscribe(e.target.checked)}
                        className="cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed accent-brand-500"
                        title={
                          (!whisperStatus.binary_available || !whisperStatus.model_available)
                            ? "Whisper backend tools not compiled or tiny model missing. Configure in settings."
                            : ""
                        }
                      />
                    </div>

                    {!whisperStatus.model_available && (
                      <p className="text-[10px] text-amber-400 leading-normal bg-amber-500/10 border border-amber-500/15 rounded-lg p-2">
                        Whisper components not set up. Click Settings to trigger the Metal-optimized compilation and model download.
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={clearMetadata}
                        className="flex-1 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 font-semibold text-xs text-gray-300 cursor-pointer transition-all"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleQueueDownload}
                        className="flex-[2] h-10 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold text-xs text-white shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                      >
                        <Plus className="w-4 h-4" />
                        Queue Download
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Playlist Preview Card */}
              {playlistPreview && (
                <div className="glass rounded-2xl p-5 border border-white/5 shadow-2xl flex flex-col gap-4 animate-fade-in">
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-200 flex items-center gap-1.5">
                      <List className="w-4 h-4 text-brand-500" />
                      Playlist: {playlistPreview.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 font-medium">{playlistPreview.uploader} • {playlistPreview.entries.length} items</p>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-gray-400 border-b border-white/5 pb-2">
                    <button
                      onClick={() => {
                        if (selectedPlaylistVideoIds.length === playlistPreview.entries.length) {
                          setSelectedPlaylistVideoIds([]);
                        } else {
                          setSelectedPlaylistVideoIds(playlistPreview.entries.map(e => e.id));
                        }
                      }}
                      className="hover:text-white cursor-pointer font-bold uppercase tracking-wider"
                    >
                      {selectedPlaylistVideoIds.length === playlistPreview.entries.length ? "Deselect All" : "Select All"}
                    </button>
                    <span>{selectedPlaylistVideoIds.length} of {playlistPreview.entries.length} selected</span>
                  </div>

                  {/* Playlist Entries Scrollable */}
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-white/5 rounded-lg p-2 bg-black/30">
                    {playlistPreview.entries.map((entry) => {
                      const isChecked = selectedPlaylistVideoIds.includes(entry.id);
                      return (
                        <label
                          key={`pl-${entry.id}`}
                          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer border transition-all ${
                            isChecked ? "bg-white/5 border-white/10" : "border-transparent hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedPlaylistVideoIds(selectedPlaylistVideoIds.filter(id => id !== entry.id));
                              } else {
                                setSelectedPlaylistVideoIds([...selectedPlaylistVideoIds, entry.id]);
                              }
                            }}
                            className="mt-0.5 accent-brand-500 shrink-0"
                          />
                          <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-semibold text-gray-200 line-clamp-1 leading-normal">{entry.title}</p>
                            <div className="flex gap-2 items-center text-[10px] text-gray-500 mt-1">
                              <span>{entry.uploader}</span>
                              <span>•</span>
                              <span>{formatDuration(entry.duration)}</span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Formats Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Format Presets
                    </label>
                    <select
                      value={formatId}
                      onChange={(e) => setFormatId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none cursor-pointer"
                    >
                      <option value="best" className="bg-panel-dark">Best Quality</option>
                      <option value="1080p" className="bg-panel-dark">1080p</option>
                      <option value="720p" className="bg-panel-dark">720p</option>
                      <option value="mp3" className="bg-panel-dark">MP3 Audio Only</option>
                    </select>
                  </div>

                  {/* Transcription opt-in */}
                  <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                        Transcribe Selected Items
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={optInTranscribe}
                      disabled={!whisperStatus.binary_available || !whisperStatus.model_available}
                      onChange={(e) => setOptInTranscribe(e.target.checked)}
                      className="cursor-pointer accent-brand-500"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={clearPlaylistMetadata}
                      className="flex-1 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 font-semibold text-xs text-gray-300 cursor-pointer transition-all"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleQueuePlaylist}
                      disabled={selectedPlaylistVideoIds.length === 0}
                      className="flex-[2] h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 font-bold text-xs text-white shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                    >
                      <Plus className="w-4 h-4" />
                      Queue Selected ({selectedPlaylistVideoIds.length})
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Right Column: Download queue */}
            <section className="col-span-7 flex flex-col gap-6 overflow-hidden">
              <div className="flex-1 glass rounded-2xl p-5 flex flex-col gap-4 overflow-hidden border border-white/5 shadow-xl">
                <div className="flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="font-bold text-sm tracking-wide text-gray-200">
                      Download Queue
                    </h2>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Sequential processing enabled ({downloads.filter(d => ["Downloading", "Starting...", "Merging", "Extracting"].some(s => d.status.includes(s))).length} active, limit {settings.concurrencyLimit})
                    </p>
                  </div>

                  {downloads.some(d => ["Completed", "Cancelled", "Error"].some(s => d.status.includes(s) || d.status.startsWith(s))) && (
                    <button
                      onClick={clearHistory}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-[10px] font-semibold text-gray-400 hover:text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear History
                    </button>
                  )}
                </div>

                {/* Queue List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {downloads.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                      <Video className="w-8 h-8 text-gray-600 animate-pulse" />
                      <div>
                        <p className="font-bold text-sm text-gray-400">Queue is empty</p>
                        <p className="text-xs mt-1">Enter link details on the left to start downloading</p>
                      </div>
                    </div>
                  ) : (
                    downloads.map((item, index) => {
                      const isActive = ["Downloading", "Merging", "Extracting", "Starting"].some(s => item.status.includes(s));
                      const isCompleted = item.status.startsWith("Completed");
                      const isError = item.status.startsWith("Error:");
                      const isCancelled = item.status === "Cancelled";
                      const isQueued = item.status === "Queued";

                      return (
                        <div
                          key={item.taskId}
                          className="glass rounded-xl p-3.5 border border-white/5 flex gap-4 transition-all relative overflow-hidden group"
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                            isCompleted ? "bg-emerald-500" : isError ? "bg-red-500" : isCancelled ? "bg-gray-500" : isQueued ? "bg-blue-500" : "bg-brand-500"
                          }`}></div>

                          <div className="w-24 aspect-video bg-black/35 rounded-lg overflow-hidden shrink-0 relative">
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                                <Video className="w-5 h-5" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/30"></div>
                            <div className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[8px] font-bold text-white">
                              {formatDuration(item.duration)}
                            </div>
                          </div>

                          <div className="flex-1 flex flex-col justify-between overflow-hidden">
                            <div className="flex justify-between items-start gap-3">
                              <div className="overflow-hidden">
                                <h4 className="font-semibold text-xs text-gray-200 line-clamp-1">
                                  {item.title}
                                </h4>
                                <p className="text-[10px] text-gray-500 font-medium mt-0.5 flex items-center gap-1.5">
                                  <span>{item.uploader}</span>
                                  <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                  <span className="uppercase text-[9px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                                    {item.format}
                                  </span>
                                  {item.trimRange && (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                      <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1 py-0.5 rounded">
                                        Clip
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Order queue */}
                                {isQueued && (
                                  <div className="flex flex-col">
                                    <button
                                      disabled={index === 0}
                                      onClick={() => reorderQueue(index, "up")}
                                      className="p-0.5 rounded hover:bg-white/5 disabled:opacity-25 cursor-pointer text-gray-500 hover:text-white"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      disabled={index === downloads.length - 1}
                                      onClick={() => reorderQueue(index, "down")}
                                      className="p-0.5 rounded hover:bg-white/5 disabled:opacity-25 cursor-pointer text-gray-500 hover:text-white"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                {/* Cancel */}
                                {(isActive || isQueued) && (
                                  <button
                                    onClick={() => cancelDownload(item.taskId)}
                                    className="w-6 h-6 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center cursor-pointer transition-all"
                                    title="Cancel"
                                  >
                                    <X className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
                                  </button>
                                )}

                                {isCompleted && (
                                  <>
                                    {item.filePath && (
                                      <button
                                        onClick={async () => {
                                          try {
                                            await revealItemInDir(item.filePath!);
                                          } catch (e) {
                                            console.error(e);
                                          }
                                        }}
                                        className="w-6 h-6 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center cursor-pointer transition-all"
                                        title="Show in Finder"
                                      >
                                        <FolderOpen className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
                                      </button>
                                    )}
                                    <div className="w-6 h-6 flex items-center justify-center">
                                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Progress stats */}
                            {(isActive || item.status === "Starting...") && (
                              <div className="mt-2.5 animate-fade-in">
                                <div className="flex justify-between text-[10px] text-gray-400 font-semibold mb-1">
                                  <span className="text-brand-500">{item.status}... {Math.round(item.percentage)}%</span>
                                  <div className="flex gap-3 text-gray-500">
                                    {item.sponsorblockSkipped && item.sponsorblockSkipped > 0 ? (
                                      <span className="text-amber-400">Skipped {item.sponsorblockSkipped} segment</span>
                                    ) : null}
                                    <span>{item.speed}</span>
                                    <span>ETA {item.eta}</span>
                                  </div>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-brand-600 to-brand-500 rounded-full transition-all duration-300"
                                    style={{ width: `${item.percentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}

                            {!isActive && item.status !== "Starting..." && (
                              <div className="mt-2 text-[10px] flex items-center justify-between text-gray-500 font-semibold">
                                <span className={isCompleted ? "text-emerald-500" : isError ? "text-red-400" : "text-gray-500"}>
                                  {item.status}
                                </span>
                                <span>{item.addedAt}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* VIEW: LIBRARY */}
        {activeTab === "library" && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden border border-white/5 glass rounded-2xl p-5 shadow-xl">
            <div className="flex justify-between items-center shrink-0">
              <div>
                <h2 className="font-bold text-sm tracking-wide text-gray-200">Library Vault</h2>
                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">All successfully downloaded files cached locally ({library.length} items)</p>
              </div>
              <button
                onClick={() => loadLibrary()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-xs font-semibold text-gray-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload DB
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {library.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                  <Database className="w-8 h-8 text-gray-600" />
                  <div>
                    <p className="font-bold text-sm text-gray-400">Library is empty</p>
                    <p className="text-xs mt-1">Successfully completed downloads will appear here</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {library.map((item) => {
                    const progress = whisperProgress[item.id];
                    const isTranscribing = item.transcript_status === "transcribing" || progress?.status === "Transcribing";
                    const isTranscribed = item.transcript_status === "completed";
                    const isFailedTranscribe = item.transcript_status === "failed";

                    return (
                      <div
                        key={item.id}
                        className="glass rounded-xl p-3.5 border border-white/5 flex gap-4 transition-all relative overflow-hidden group hover:border-white/10"
                      >
                        <div className="w-28 aspect-video bg-black/45 rounded-lg overflow-hidden shrink-0 relative">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                              <Video className="w-5 h-5" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20"></div>
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-[8px] font-bold text-white">
                            {formatDuration(item.duration)}
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-between overflow-hidden">
                          <div>
                            <h4 className="font-bold text-xs text-gray-200 line-clamp-1 leading-snug">
                              {item.title}
                            </h4>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">{item.uploader}</p>
                            
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="text-[8px] font-extrabold uppercase text-gray-400 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">
                                {item.format}
                              </span>
                              
                              {/* Transcript Label */}
                              {isTranscribed && (
                                <span className="text-[8px] font-extrabold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Indexed Search
                                </span>
                              )}
                              {isTranscribing && (
                                <span className="text-[8px] font-extrabold uppercase text-brand-400 bg-brand-500/10 border border-brand-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  Transcribing ({Math.round(progress?.progress || 0)}%)
                                </span>
                              )}
                              {isFailedTranscribe && (
                                <span className="text-[8px] font-extrabold uppercase text-red-400 bg-red-500/10 border border-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <AlertOctagon className="w-2.5 h-2.5" />
                                  Transcription Failed
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5 shrink-0">
                            <span className="text-[9px] text-gray-500 font-semibold">{new Date(item.added_at).toLocaleString()}</span>
                            
                            <div className="flex gap-1.5">
                              {/* Transcribe Trigger manually */}
                              {!isTranscribed && !isTranscribing && item.file_path && (
                                <button
                                  onClick={() => transcribeVideo(item.id, item.file_path!)}
                                  className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-[9px] font-bold text-gray-300 flex items-center gap-1 cursor-pointer transition-all"
                                  title="Transcribe manually for search index"
                                >
                                  <Sparkles className="w-3 h-3 text-brand-400" />
                                  Index
                                </button>
                              )}

                              {item.file_path && (
                                <button
                                  onClick={() => setActivePlayerVideo({ filePath: item.file_path!, title: item.title })}
                                  className="w-7 h-7 rounded bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow shadow-brand-500/10 text-white cursor-pointer transition-all hover:scale-[1.05]"
                                  title="Play in App"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                              )}

                              {item.file_path && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await revealItemInDir(item.file_path!);
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  }}
                                  className="w-7 h-7 rounded bg-white/5 border border-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-all"
                                  title="Reveal in Finder"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => deleteLibraryItem(item.id)}
                                className="w-7 h-7 rounded bg-red-500/10 border border-red-500/15 hover:bg-red-500/25 flex items-center justify-center text-red-400 cursor-pointer transition-all"
                                title="Delete library record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: SEARCH TRANSCRIPTS */}
        {activeTab === "search" && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden border border-white/5 glass rounded-2xl p-5 shadow-xl">
            <div className="shrink-0 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-sm tracking-wide text-gray-200">Transcript Search</h2>
                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Search for words spoken in downloaded files to deep-link to segments</p>
              </div>
            </div>

            <form onSubmit={handleSearchLocal} className="shrink-0 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Type a word or phrase (e.g. 'machine learning', 'database', etc.)..."
                  value={searchQueryLocal}
                  onChange={(e) => setSearchQueryLocal(e.target.value)}
                  className="w-full h-11 px-4 pr-10 rounded-xl glass-input text-sm text-gray-200"
                />
                {librarySearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQueryLocal("");
                      clearLibrarySearch();
                    }}
                    className="absolute right-12 top-2 w-7 h-7 rounded bg-white/5 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={libraryLoading}
                  className="absolute right-2 top-1.5 w-8 h-8 rounded-lg bg-brand-500 hover:bg-brand-600 flex items-center justify-center cursor-pointer transition-all"
                >
                  {libraryLoading ? (
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {libraryLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                  <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                  <p className="text-xs">Searching transcript database segments...</p>
                </div>
              ) : librarySearchResults.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                  <Search className="w-8 h-8 text-gray-600" />
                  <div>
                    <p className="font-bold text-sm text-gray-400">
                      {librarySearchQuery ? "No segments match your query" : "Search is empty"}
                    </p>
                    <p className="text-xs mt-1">
                      {librarySearchQuery
                        ? "Ensure you checked the 'Transcribe' option during download, or run 'Index' manually on the Library tab."
                        : "Enter a query term to pull spoken segments."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-500 font-semibold px-1">Found {librarySearchResults.length} segments matching "{librarySearchQuery}"</p>
                  {librarySearchResults.map((res, sIdx) => (
                    <div
                      key={`search-res-${sIdx}`}
                      className="glass rounded-xl p-3 border border-white/5 flex items-start gap-4 transition-all hover:border-white/10"
                    >
                      <div className="w-20 aspect-video rounded overflow-hidden bg-black/40 shrink-0 relative">
                        {res.thumbnail ? (
                          <img src={res.thumbnail} alt={res.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-600">
                            <Video className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-bold text-xs text-gray-200 line-clamp-1 leading-normal">
                          {res.title}
                        </h4>
                        <p className="text-[10px] text-gray-500 mt-0.5">{res.uploader}</p>

                        {/* Match Segment Highlight */}
                        <div className="mt-2.5 flex items-start gap-2 bg-white/5 border border-white/5 p-2 rounded-lg relative overflow-hidden group">
                          <span className="text-[9px] font-mono font-bold text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded shrink-0">
                            {formatTimeMs(res.start_ms)}
                          </span>
                          <p className="text-[11px] text-gray-300 italic line-clamp-2 leading-relaxed">
                            "... {res.text} ..."
                          </p>

                          {res.file_path && (
                            <button
                              onClick={() => setActivePlayerVideo({ filePath: res.file_path!, title: res.title, jumpTimeMs: res.start_ms })}
                              className="absolute right-2 top-2 p-1 bg-brand-500 hover:bg-brand-600 rounded text-white shadow shadow-brand-500/15 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Play spoken segment"
                            >
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: SUBSCRIPTIONS */}
        {activeTab === "subscriptions" && (
          <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
            {/* Left sidebar: subscribe form */}
            <div className="col-span-5 flex flex-col gap-6 overflow-y-auto pr-1">
              <div className="glass rounded-2xl p-5 flex flex-col gap-4 shadow-xl shrink-0">
                <h3 className="font-bold text-xs tracking-wide text-gray-400 uppercase">
                  Subscribe to Channel / Playlist
                </h3>
                <form onSubmit={handleAddSubscription} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">Feed URL</span>
                    <input
                      type="text"
                      placeholder="Paste channel URL or playlist link..."
                      value={subUrl}
                      onChange={(e) => setSubUrl(e.target.value)}
                      className="h-10 px-3 rounded-xl glass-input text-xs text-gray-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">Subscription Name</span>
                    <input
                      type="text"
                      placeholder="e.g. My Favorite Science Feed..."
                      value={subTitle}
                      onChange={(e) => setSubTitle(e.target.value)}
                      className="h-10 px-3 rounded-xl glass-input text-xs text-gray-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">Type</span>
                    <select
                      value={subType}
                      onChange={(e) => setSubType(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none cursor-pointer"
                    >
                      <option value="channel" className="bg-panel-dark">Channel Feed</option>
                      <option value="playlist" className="bg-panel-dark">Playlist Feed</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="h-10 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold text-xs text-white shadow-lg shadow-brand-500/20 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    Subscribe Feed
                  </button>
                </form>
              </div>
            </div>

            {/* Right side: subscription feeds list */}
            <div className="col-span-7 flex flex-col border border-white/5 glass rounded-2xl p-5 overflow-hidden shadow-xl">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <div>
                  <h3 className="font-bold text-sm tracking-wide text-gray-200">Active Feeds</h3>
                  <p className="text-[10px] text-gray-500 font-medium">Automatic archiving checking enabled ({subscriptions.length} feeds)</p>
                </div>
                <button
                  disabled={subscriptionsLoading || subscriptions.length === 0}
                  onClick={() => checkSubscriptions()}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-xs font-bold text-white shadow shadow-brand-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${subscriptionsLoading ? "animate-spin" : ""}`} />
                  Sync & Fetch New
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {subscriptionsLoading && subscriptions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                    <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                    <p className="text-xs">Fetching feed index updates...</p>
                  </div>
                ) : subscriptions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500">
                    <Heart className="w-8 h-8 text-gray-600" />
                    <div>
                      <p className="font-bold text-sm text-gray-400">No active subscriptions</p>
                      <p className="text-xs mt-1">Subscribe to channels or playlists to check and pull new uploads locally</p>
                    </div>
                  </div>
                ) : (
                  subscriptions.map((sub) => (
                    <div
                      key={sub.url}
                      className="glass rounded-xl p-3.5 border border-white/5 flex justify-between items-start gap-4 transition-all hover:border-white/10"
                    >
                      <div className="overflow-hidden">
                        <h4 className="font-bold text-xs text-gray-200 line-clamp-1 leading-normal">
                          {sub.title}
                        </h4>
                        <div className="flex flex-wrap gap-2 items-center text-[10px] text-gray-500 mt-1.5 font-medium">
                          <span className="uppercase text-[9px] font-extrabold text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">
                            {sub.type_info}
                          </span>
                          <span>•</span>
                          <span>Last Checked: {sub.last_checked || "Never"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => deleteSubscription(sub.url)}
                          className="w-7 h-7 rounded bg-red-500/10 border border-red-500/15 hover:bg-red-500/25 flex items-center justify-center text-red-400 cursor-pointer transition-all"
                          title="Unsubscribe feed"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: VIDEO PLAYER */}
      {activePlayerVideo && (
        <div className="absolute inset-0 bg-black/95 flex flex-col z-50 animate-fade-in">
          {/* Header */}
          <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/60 backdrop-blur shrink-0">
            <span className="font-bold text-xs text-gray-200 line-clamp-1 pr-12">{activePlayerVideo.title}</span>
            <button
              onClick={() => setActivePlayerVideo(null)}
              className="w-7 h-7 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Player area */}
          <div className="flex-1 flex items-center justify-center p-6 bg-black relative">
            <video
              ref={videoPlayerRef}
              src={convertFileSrc(activePlayerVideo.filePath)}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg shadow-2xl border border-white/15"
            />
          </div>
        </div>
      )}

      {/* MODAL: SETTINGS PANEL */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-45 animate-fade-in p-6">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-scale-up">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-panel-border shrink-0">
              <h2 className="font-bold text-base text-gray-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-500" />
                Settings Control
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="w-7 h-7 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center cursor-pointer transition-all"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              
              {/* Output directory */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  Output Directory
                </label>
                <input
                  type="text"
                  placeholder="~/Vidralo/Downloads"
                  value={settings.outputDir}
                  onChange={(e) => saveSettings({ outputDir: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none"
                />
                <p className="text-[9px] text-gray-500">Leave empty to target ~/Vidralo/Downloads.</p>
              </div>

              {/* Browser cookies */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  Cookie Extraction
                </label>
                <select
                  value={settings.cookiesBrowser}
                  onChange={(e) => saveSettings({ cookiesBrowser: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none cursor-pointer font-semibold"
                >
                  <option value="none" className="bg-panel-dark">Disabled</option>
                  <option value="chrome" className="bg-panel-dark">Google Chrome</option>
                  <option value="firefox" className="bg-panel-dark">Mozilla Firefox</option>
                  <option value="edge" className="bg-panel-dark">Microsoft Edge</option>
                  <option value="safari" className="bg-panel-dark">Apple Safari</option>
                </select>
                <p className="text-[9px] text-gray-500">Reads cookies session identifiers locally to download restricted or private resources.</p>
              </div>

              {/* FFmpeg Location path */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                  <span>Custom FFmpeg Executable Path</span>
                  <span className={`text-[9px] font-bold ${ffmpegAvailable ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"} px-1.5 py-0.5 rounded`}>
                    {ffmpegAvailable ? "FFmpeg Detected" : "FFmpeg Missing"}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. /usr/local/bin/ffmpeg or C:\ffmpeg\bin\ffmpeg.exe"
                  value={settings.ffmpegPath}
                  onChange={(e) => saveSettings({ ffmpegPath: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none"
                />
              </div>

              {/* Queue Limits Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Queue Concurrency ({settings.concurrencyLimit})
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.concurrencyLimit}
                    onChange={(e) => saveSettings({ concurrencyLimit: parseInt(e.target.value) })}
                    className="w-full h-8 accent-brand-500 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Bandwidth Limiter
                  </label>
                  <select
                    value={settings.bandwidthThrottle}
                    onChange={(e) => saveSettings({ bandwidthThrottle: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none cursor-pointer font-semibold"
                  >
                    <option value="unlimited" className="bg-panel-dark">Unlimited</option>
                    <option value="10M" className="bg-panel-dark">10 MB/s</option>
                    <option value="5M" className="bg-panel-dark">5 MB/s</option>
                    <option value="1M" className="bg-panel-dark">1 MB/s</option>
                    <option value="500K" className="bg-panel-dark">500 KB/s</option>
                  </select>
                </div>
              </div>

              {/* Output name builder template */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  Filename Template Structure
                </label>
                <input
                  type="text"
                  value={settings.filenameTemplate}
                  onChange={(e) => saveSettings({ filenameTemplate: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none font-mono"
                  placeholder="%(title)s [%(id)s].%(ext)s"
                />
                <p className="text-[9px] text-brand-400 font-semibold bg-white/5 p-2 rounded-lg font-mono leading-normal">
                  Preview: {getTemplatePreview(settings.filenameTemplate)}
                </p>
                <p className="text-[9px] text-gray-500 leading-normal">
                  Supported tokens: <span className="font-mono text-gray-400">%(title)s</span>, <span className="font-mono text-gray-400">%(id)s</span>, <span className="font-mono text-gray-400">%(uploader)s</span>, <span className="font-mono text-gray-400">%(resolution)s</span>, <span className="font-mono text-gray-400">%(ext)s</span>.
                </p>
              </div>

              {/* SponsorBlock Control */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[11px] font-extrabold text-gray-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-brand-500 animate-pulse" />
                    SponsorBlock Integration
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sponsorblockEnabled}
                    onChange={(e) => saveSettings({ sponsorblockEnabled: e.target.checked })}
                    className="cursor-pointer accent-brand-500"
                  />
                </div>
                {settings.sponsorblockEnabled && (
                  <div className="grid grid-cols-2 gap-2 mt-1.5 animate-fade-in text-[10px] text-gray-400">
                    {["sponsor", "selfpromo", "interaction", "intro", "outro", "music_offtopic", "filler"].map((cat) => {
                      const hasCat = settings.sponsorblockCategories.includes(cat);
                      return (
                        <label key={`cat-${cat}`} className="flex items-center gap-1.5 cursor-pointer hover:text-white capitalize">
                          <input
                            type="checkbox"
                            checked={hasCat}
                            onChange={() => {
                              if (hasCat) {
                                saveSettings({ sponsorblockCategories: settings.sponsorblockCategories.filter(c => c !== cat) });
                              } else {
                                saveSettings({ sponsorblockCategories: [...settings.sponsorblockCategories, cat] });
                              }
                            }}
                          />
                          {cat.replace("_", " ")}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Plugins Downloader allowlist */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2.5">
                <div>
                  <span className="text-[11px] font-extrabold text-gray-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-400" />
                    Secure Plugin Manager
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5">Install allowlisted extensions for advanced downloader integration.</p>
                </div>
                <div className="flex justify-between items-center mt-1 border-t border-white/5 pt-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-200">ChromeCookieUnlock</p>
                    <p className="text-[9px] text-gray-500">Unlocks locked Chrome cookies storage files on macOS/Windows.</p>
                  </div>
                  <button
                    disabled={pluginInstalling}
                    onClick={handleInstallPlugin}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-[10px] font-bold text-gray-300 flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {pluginInstalling ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5" />
                    )}
                    Install Plugin
                  </button>
                </div>
                {pluginMessage && (
                  <p className="text-[9px] text-brand-400 font-bold bg-brand-500/5 border border-brand-500/10 p-2 rounded-lg leading-normal animate-fade-in">
                    {pluginMessage}
                  </p>
                )}
              </div>

              {/* Whisper status & build tools */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2.5">
                <div>
                  <span className="text-[11px] font-extrabold text-gray-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                    Whisper AI Engine
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5 font-medium">Whisper.cpp transcribes video audio locally using Metal GPU.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase">Whisper Engine</span>
                    <p className={`text-xs font-bold mt-1 ${whisperStatus.binary_available ? "text-emerald-400" : "text-amber-400"}`}>
                      {whisperStatus.binary_available ? "Available (Natively Compiled)" : "Not Compiled"}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase">Tiny Model File</span>
                    <p className={`text-xs font-bold mt-1 ${whisperStatus.model_available ? "text-emerald-400" : "text-amber-400"}`}>
                      {whisperStatus.model_available ? "Available (75MB)" : "Missing"}
                    </p>
                  </div>
                </div>

                {/* Compilation triggers */}
                {(!whisperStatus.binary_available || !whisperStatus.model_available) && (
                  <div className="flex gap-2 mt-1">
                    {!whisperStatus.binary_available && (
                      <button
                        onClick={setupWhisperBinary}
                        className="flex-1 h-9 rounded-lg bg-brand-500 hover:bg-brand-600 text-[10px] font-bold text-white shadow shadow-brand-500/10 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        Compile Engine (Metal macOS)
                      </button>
                    )}
                    {!whisperStatus.model_available && (
                      <button
                        onClick={setupWhisperModel}
                        className="flex-1 h-9 rounded-lg bg-brand-500 hover:bg-brand-600 text-[10px] font-bold text-white shadow shadow-brand-500/10 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <FileDown className="w-3 h-3" />
                        Download Model
                      </button>
                    )}
                  </div>
                )}

                {/* Whisper compiler progress */}
                {whisperProgress["setup"] && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2.5">
                    <div className="flex justify-between text-[10px] text-brand-400 font-bold">
                      <span>{whisperProgress["setup"].status}</span>
                      <span>{Math.round(whisperProgress["setup"].progress)}%</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-300"
                        style={{ width: `${whisperProgress["setup"].progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidecars Version & Updates */}
              <div className="pt-4 border-t border-panel-border flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-xs text-gray-300">Tool Version Details</h3>
                    <p className="text-[10px] text-gray-500 font-medium">Bundled platform sidecars metadata</p>
                  </div>
                  <button
                    onClick={handleCheckUpdates}
                    disabled={updateStatus.checking || updateStatus.updating}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-xs font-semibold text-gray-300 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdatesLocal ? "animate-spin" : ""}`} />
                    Check Updates
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase">yt-dlp</p>
                    <p className="text-sm font-bold text-gray-200 mt-1">{binaryVersions.yt_dlp}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase">PO Token provider</p>
                    <p className="text-sm font-bold text-gray-200 mt-1">{binaryVersions.bgutil_pot}</p>
                  </div>
                </div>

                {updateStatus.updateAvailable && !updateStatus.updating && (
                  <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="font-bold text-xs text-brand-400">Updates Available!</p>
                        <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                          Newer binary releases found on GitHub. Update to ensure downloader compatibility.
                        </p>
                      </div>
                      <button
                        onClick={performUpdates}
                        className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-xs font-bold text-white shrink-0 cursor-pointer transition-all shadow-md shadow-brand-500/15"
                      >
                        Update Now
                      </button>
                    </div>

                    {updateStatus.checkResult && (
                      <div className="text-[10px] text-gray-500 space-y-1">
                        {updateStatus.checkResult.yt_dlp_update_available && (
                          <div className="flex justify-between">
                            <span>yt-dlp update:</span>
                            <span className="font-medium">{updateStatus.checkResult.yt_dlp_current} → {updateStatus.checkResult.yt_dlp_latest}</span>
                          </div>
                        )}
                        {updateStatus.checkResult.bgutil_update_available && (
                          <div className="flex justify-between">
                            <span>PO Attestor update:</span>
                            <span className="font-medium">{updateStatus.checkResult.bgutil_current} → {updateStatus.checkResult.bgutil_latest}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {updateStatus.updating && (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-3">
                    <div className="flex justify-between text-xs text-gray-300 font-semibold">
                      <span>{updateStatus.progressText}</span>
                      <span>{Math.round(updateStatus.progressPercent)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-600 to-brand-500 rounded-full transition-all duration-300"
                        style={{ width: `${updateStatus.progressPercent}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {updateStatus.progressText && !updateStatus.updating && (
                  <p className="text-[10px] text-center text-emerald-500 font-semibold">
                    {updateStatus.progressText}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
