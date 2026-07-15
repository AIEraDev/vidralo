import { useEffect, useState } from "react";
import { useStore } from "./store";
import "./App.css";
import {
  Search,
  Download,
  Settings,
  Trash2,
  X,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Globe,
  Clock,
  Video,
  AlertOctagon,
  ArrowRight
} from "lucide-react";

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

export default function App() {
  const {
    downloads,
    metadataPreview,
    metadataLoading,
    metadataError,
    settings,
    binaryVersions,
    updateStatus,
    ffmpegAvailable,
    fetchMetadata,
    clearMetadata,
    startDownload,
    cancelDownload,
    clearHistory,
    loadSettings,
    saveSettings,
    checkUpdates,
    performUpdates
  } = useStore();

  const [url, setUrl] = useState("");
  const [formatId, setFormatId] = useState("best");
  const [showSettings, setShowSettings] = useState(false);
  const [checkingUpdatesLocal, setCheckingUpdatesLocal] = useState(false);

  // Initialize settings and check binary versions
  useEffect(() => {
    loadSettings();
  }, []);

  const handleFetchMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    fetchMetadata(url.trim());
  };

  const handleStartDownload = () => {
    if (!metadataPreview) return;
    startDownload(url.trim(), formatId);
    setUrl("");
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdatesLocal(true);
    await checkUpdates();
    setCheckingUpdatesLocal(false);
  };

  return (
    <div className="min-h-screen bg-bg-dark text-gray-100 flex flex-col font-sans select-none overflow-hidden relative">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[50%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Top Navbar */}
      <header className="h-16 border-b border-panel-border glass flex items-center justify-between px-6 z-10 no-select">
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

      {/* Main Grid Layout */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Left Column: Download input & metadata preview */}
        <section className="col-span-5 flex flex-col gap-6 overflow-y-auto pr-1">
          {/* Input Panel */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <h2 className="font-bold text-sm tracking-wide text-gray-400 uppercase">
              New Download
            </h2>
            <form onSubmit={handleFetchMetadata} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Paste YouTube video or playlist URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full h-11 px-4 pr-10 rounded-xl glass-input text-sm text-gray-200"
                />
                <button
                  type="submit"
                  disabled={metadataLoading}
                  className="absolute right-2 top-1.5 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all disabled:opacity-50"
                >
                  {metadataLoading ? (
                    <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 text-gray-300" />
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Loading state */}
          {metadataLoading && (
            <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
                <Globe className="w-5 h-5 text-brand-500 absolute animate-pulse" />
              </div>
              <div>
                <p className="font-bold text-gray-200">Extracting Metadata...</p>
                <p className="text-xs text-gray-500 mt-1">Analyzing video formats directly from user IP</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {metadataError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-bold text-sm text-red-200">Extraction Failed</p>
                <p className="text-xs text-red-400/80 mt-1 leading-relaxed">{metadataError}</p>
                <button
                  onClick={() => fetchMetadata(url)}
                  className="mt-3 text-xs text-red-200 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  Retry analysis <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Metadata Preview Card */}
          {metadataPreview && (
            <div className="glass rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-white/5 animate-fade-in">
              {/* Thumbnail Container */}
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

              {/* Details */}
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
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
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

                {/* FFmpeg Alert warning */}
                {!ffmpegAvailable && (formatId === "best" || formatId === "1080p") && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3 text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <p className="text-[11px] leading-relaxed">
                      <strong>FFmpeg not detected!</strong> Merging high-quality video and audio might fail. We recommend selecting 720p or audio-only formats, or configuring FFmpeg in settings.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={clearMetadata}
                    className="flex-1 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 font-semibold text-xs text-gray-300 cursor-pointer transition-all"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleStartDownload}
                    className="flex-[2] h-10 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold text-xs text-white shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                  >
                    <Download className="w-4 h-4" />
                    Download Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Info Card when empty */}
          {!metadataPreview && !metadataLoading && (
            <div className="glass rounded-2xl p-6 border border-white/5 flex flex-col gap-4 text-gray-400">
              <h3 className="font-bold text-xs tracking-wider uppercase text-gray-200">
                Local-First Downloader
              </h3>
              <ul className="text-xs space-y-3">
                <li className="flex gap-3">
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="leading-relaxed">
                    Downloads stream directly from your own IP address, completely evading YouTube bot blocks targeted at cloud hosting servers.
                  </p>
                </li>
                <li className="flex gap-3">
                  <Globe className="w-4 h-4 text-brand-500 shrink-0" />
                  <p className="leading-relaxed">
                    Proof-of-Origin (PO) tokens are computed locally via bundled attestation helpers on your desktop to sign requests on-demand.
                  </p>
                </li>
              </ul>
            </div>
          )}
        </section>

        {/* Right Column: Download queue & History */}
        <section className="col-span-7 flex flex-col gap-6 overflow-hidden">
          {/* Active Queue */}
          <div className="flex-1 glass rounded-2xl p-5 flex flex-col gap-4 overflow-hidden border border-white/5 shadow-xl">
            <div className="flex justify-between items-center shrink-0">
              <div>
                <h2 className="font-bold text-sm tracking-wide text-gray-200">
                  Download Queue
                </h2>
                <p className="text-[10px] text-gray-500 font-medium">
                  {downloads.filter(d => d.status === "Downloading" || d.status.includes("Merging")).length} active tasks
                </p>
              </div>

              {downloads.some(d => d.status === "Completed" || d.status === "Cancelled" || d.status.startsWith("Error:")) && (
                <button
                  onClick={clearHistory}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-[10px] font-semibold text-gray-400 hover:text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Completed
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
                    <p className="text-xs mt-1">Paste a video link on the left to start downloading</p>
                  </div>
                </div>
              ) : (
                downloads.map((item) => {
                  const isActive = item.status === "Downloading" || item.status.includes("Merging") || item.status.includes("Extracting") || item.status.includes("Starting");
                  const isCompleted = item.status === "Completed";
                  const isError = item.status.startsWith("Error:");
                  const isCancelled = item.status === "Cancelled";

                  return (
                    <div
                      key={item.taskId}
                      className="glass rounded-xl p-3.5 border border-white/5 flex gap-4 transition-all relative overflow-hidden group"
                    >
                      {/* Left border indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isCompleted ? "bg-emerald-500" : isError ? "bg-red-500" : isCancelled ? "bg-gray-500" : "bg-brand-500"
                      }`}></div>

                      {/* Video Thumbnail */}
                      <div className="w-24 aspect-video bg-black/35 rounded-lg overflow-hidden shrink-0 relative">
                        <img
                          src={item.thumbnail || "/placeholder.jpg"}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30"></div>
                        <div className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[8px] font-bold text-white">
                          {formatDuration(item.duration)}
                        </div>
                      </div>

                      {/* Download Details */}
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
                            </p>
                          </div>

                          {/* Cancel/Kill button */}
                          {isActive && (
                            <button
                              onClick={() => cancelDownload(item.taskId)}
                              className="w-6 h-6 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center cursor-pointer transition-all shrink-0"
                              title="Cancel download"
                            >
                              <X className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
                            </button>
                          )}

                          {isCompleted && (
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            </div>
                          )}
                        </div>

                        {/* Progress controls */}
                        {isActive && (
                          <div className="mt-2.5">
                            {/* Stats */}
                            <div className="flex justify-between text-[10px] text-gray-400 font-semibold mb-1">
                              <span className="text-brand-500">{item.status}... {Math.round(item.percentage)}%</span>
                              <div className="flex gap-3 text-gray-500">
                                <span>{item.speed}</span>
                                <span>ETA {item.eta}</span>
                              </div>
                            </div>
                            {/* Bar */}
                            <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-brand-600 to-brand-500 rounded-full transition-all duration-300"
                                style={{ width: `${item.percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {!isActive && (
                          <div className="mt-2 text-[10px] flex items-center justify-between text-gray-500 font-semibold">
                            <span className={isCompleted ? "text-emerald-500" : isError ? "text-red-400/90" : "text-gray-500"}>
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
      </main>

      {/* Settings Modal Panel */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-6">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-scale-up">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-panel-border shrink-0">
              <h2 className="font-bold text-base text-gray-200">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="w-7 h-7 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center cursor-pointer transition-all"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Output directory */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Output Directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="~/Vidralo/Downloads"
                    value={settings.outputDir}
                    onChange={(e) => saveSettings({ outputDir: e.target.value })}
                    className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none"
                  />
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Leave empty to download to ~/Vidralo/Downloads.
                </p>
              </div>

              {/* Browser cookies */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Cookie-Based Auth (Opt-in)
                </label>
                <select
                  value={settings.cookiesBrowser}
                  onChange={(e) => saveSettings({ cookiesBrowser: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 outline-none cursor-pointer"
                >
                  <option value="none" className="bg-panel-dark">Disabled (Do not read browser cookies)</option>
                  <option value="chrome" className="bg-panel-dark">Google Chrome</option>
                  <option value="firefox" className="bg-panel-dark">Mozilla Firefox</option>
                  <option value="edge" className="bg-panel-dark">Microsoft Edge</option>
                  <option value="safari" className="bg-panel-dark">Apple Safari</option>
                </select>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Borrow cookie sessions from your browser to download private, age-gated, or subscriber-only videos. This reads cookies from browser storage locally on-demand.
                </p>
              </div>

              {/* FFmpeg Location path */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                  <span>Custom FFmpeg Path</span>
                  <span className={`text-[10px] ${ffmpegAvailable ? "text-emerald-500" : "text-amber-500"}`}>
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
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  If `ffmpeg` is not globally installed on your system PATH, enter the full path to the executable to allow merge capabilities.
                </p>
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

                {/* Self updater status */}
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
                    {/* Bar */}
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
