import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface FormatInfo {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  is_video: boolean;
  is_audio: boolean;
  note: string | null;
}

export interface VideoMetadata {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  formats: FormatInfo[];
  subtitles: string[];
  auto_subs: string[];
}

export interface PlaylistMetadata {
  id: string;
  title: string;
  uploader: string;
  entries: PlaylistItem[];
}

export interface PlaylistItem {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  url: string;
}

export interface DownloadItem {
  taskId: string;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  percentage: number;
  speed: string;
  eta: string;
  status: string;
  addedAt: string;
  format: string;
  filePath?: string;
  sponsorblockSkipped?: number;
  // Queue configuration
  trimRange?: string;
  subLangs?: string[];
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  embedSubs?: boolean;
  transcribe?: boolean;
}

export interface LibraryItem {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  file_path: string | null;
  status: string;
  added_at: string;
  format: string;
  transcript_status: string; // 'none', 'queued', 'transcribing', 'completed', 'failed'
}

export interface SearchResult {
  video_id: string;
  title: string;
  uploader: string;
  thumbnail: string;
  file_path: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Subscription {
  url: string;
  title: string;
  type_info: string; // 'channel' or 'playlist'
  archive_path: string;
  added_at: string;
  last_checked: string | null;
}

export interface Settings {
  outputDir: string;
  ffmpegPath: string;
  cookiesBrowser: string;
  poTokenEnabled: boolean;
  concurrencyLimit: number;
  bandwidthThrottle: string; // "unlimited", "5M", "1M" etc.
  filenameTemplate: string;
  sponsorblockEnabled: boolean;
  sponsorblockCategories: string[];
  embedMetadata: boolean;
}

interface DownloadProgressPayload {
  task_id: string;
  percentage: number;
  speed: string;
  eta: string;
  status: string;
  file_path?: string | null;
  sponsorblock_skipped?: number;
}

interface UpdateProgressPayload {
  binary: string;
  progress: number;
  status: string;
}

interface TranscribeProgressPayload {
  video_id: string;
  progress: number;
  status: string;
}

interface BinaryVersions {
  yt_dlp: string;
  bgutil_pot: string;
}

interface UpdateCheckResult {
  yt_dlp_current: string;
  yt_dlp_latest: string;
  yt_dlp_update_available: boolean;
  bgutil_current: string;
  bgutil_latest: string;
  bgutil_update_available: boolean;
}

interface WhisperStatus {
  binary_available: boolean;
  model_available: boolean;
}

interface StoreState {
  downloads: DownloadItem[];
  metadataPreview: VideoMetadata | null;
  metadataLoading: boolean;
  metadataError: string | null;
  
  playlistPreview: PlaylistMetadata | null;
  playlistLoading: boolean;
  playlistError: string | null;

  library: LibraryItem[];
  librarySearchQuery: string;
  librarySearchResults: SearchResult[];
  libraryLoading: boolean;

  subscriptions: Subscription[];
  subscriptionsLoading: boolean;

  settings: Settings;
  binaryVersions: BinaryVersions;
  whisperStatus: WhisperStatus;
  whisperProgress: Record<string, { progress: number; status: string }>;
  
  updateStatus: {
    checking: boolean;
    updateAvailable: boolean;
    updating: boolean;
    progressText: string;
    progressPercent: number;
    checkResult: UpdateCheckResult | null;
  };
  ffmpegAvailable: boolean;
  
  // Actions
  fetchMetadata: (url: string) => Promise<void>;
  fetchPlaylistMetadata: (url: string) => Promise<void>;
  clearMetadata: () => void;
  clearPlaylistMetadata: () => void;
  
  // Downloads queue
  queueDownload: (item: {
    url: string;
    title: string;
    thumbnail: string;
    uploader: string;
    duration: number;
    format: string;
    trimRange?: string;
    subLangs?: string[];
    writeSubs?: boolean;
    writeAutoSubs?: boolean;
    embedSubs?: boolean;
    transcribe?: boolean;
  }) => void;
  processQueue: () => Promise<void>;
  cancelDownload: (taskId: string) => Promise<void>;
  clearHistory: () => void;
  
  // Settings
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<Settings>) => void;
  checkUpdates: () => Promise<void>;
  performUpdates: () => Promise<void>;
  checkFFmpeg: () => Promise<void>;
  installPlugin: (pluginId: string) => Promise<void>;

  // Subscriptions
  loadSubscriptions: () => Promise<void>;
  addSubscription: (url: string, title: string, typeInfo: string) => Promise<void>;
  deleteSubscription: (url: string) => Promise<void>;
  checkSubscriptions: () => Promise<void>;

  // Library & Transcriptions
  loadLibrary: () => Promise<void>;
  deleteLibraryItem: (id: string) => Promise<void>;
  searchLibrary: (query: string) => Promise<void>;
  clearLibrarySearch: () => void;
  loadWhisperStatus: () => Promise<void>;
  setupWhisperBinary: () => Promise<void>;
  setupWhisperModel: () => Promise<void>;
  transcribeVideo: (videoId: string, filePath: string) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => {
  // Listen for download progress updates from Rust
  listen<DownloadProgressPayload>("download://progress", (event) => {
    const payload = event.payload;
    set((state) => {
      const updatedDownloads = state.downloads.map((d) => {
        if (d.taskId === payload.task_id) {
          return {
            ...d,
            percentage: payload.percentage,
            speed: payload.speed,
            eta: payload.eta,
            status: payload.status,
            ...(payload.file_path ? { filePath: payload.file_path } : {}),
            sponsorblockSkipped: payload.sponsorblock_skipped || 0,
          };
        }
        return d;
      });
      localStorage.setItem("vidralo_downloads", JSON.stringify(updatedDownloads));
      return { downloads: updatedDownloads };
    });

    const isFinished = payload.status === "Completed" || payload.status.startsWith("Error:") || payload.status === "Cancelled";
    if (isFinished) {
      get().loadLibrary();
      get().processQueue();
    }
  });

  // Listen for self-updater progress updates from Rust
  listen<UpdateProgressPayload>("update://progress", (event) => {
    const payload = event.payload;
    set((state) => ({
      updateStatus: {
        ...state.updateStatus,
        progressText: payload.status,
        progressPercent: payload.progress,
      },
    }));
  });

  // Listen for transcription progress
  listen<TranscribeProgressPayload>("transcribe://progress", (event) => {
    const payload = event.payload;
    set((state) => {
      const updatedWhisperProgress = {
        ...state.whisperProgress,
        [payload.video_id]: { progress: payload.progress, status: payload.status },
      };
      
      let updatedLibrary = state.library;
      if (payload.video_id !== "setup") {
        updatedLibrary = state.library.map((item) => {
          if (item.id === payload.video_id) {
            let nextStatus = item.transcript_status;
            if (payload.status === "Completed") {
              nextStatus = "completed";
            } else if (payload.status.startsWith("Error:") || payload.status.includes("failed")) {
              nextStatus = "failed";
            } else {
              nextStatus = "transcribing";
            }
            return { ...item, transcript_status: nextStatus };
          }
          return item;
        });
      } else if (payload.status.includes("successfully") || payload.status.includes("completed")) {
        // Reload status
        setTimeout(() => get().loadWhisperStatus(), 500);
      }
      
      return { whisperProgress: updatedWhisperProgress, library: updatedLibrary };
    });
  });

  return {
    downloads: [],
    metadataPreview: null,
    metadataLoading: false,
    metadataError: null,

    playlistPreview: null,
    playlistLoading: false,
    playlistError: null,

    library: [],
    librarySearchQuery: "",
    librarySearchResults: [],
    libraryLoading: false,

    subscriptions: [],
    subscriptionsLoading: false,

    settings: {
      outputDir: "",
      ffmpegPath: "",
      cookiesBrowser: "none",
      poTokenEnabled: true,
      concurrencyLimit: 2,
      bandwidthThrottle: "unlimited",
      filenameTemplate: "%(title)s [%(id)s].%(ext)s",
      sponsorblockEnabled: false,
      sponsorblockCategories: ["sponsor", "selfpromo"],
      embedMetadata: true,
    },
    binaryVersions: {
      yt_dlp: "Loading...",
      bgutil_pot: "Loading...",
    },
    whisperStatus: {
      binary_available: false,
      model_available: false,
    },
    whisperProgress: {},
    updateStatus: {
      checking: false,
      updateAvailable: false,
      updating: false,
      progressText: "",
      progressPercent: 0,
      checkResult: null,
    },
    ffmpegAvailable: true,

    fetchMetadata: async (url: string) => {
      set({ metadataLoading: true, metadataError: null, metadataPreview: null });
      try {
        const cookies = get().settings.cookiesBrowser;
        const metadata = await invoke<VideoMetadata>("fetch_metadata", {
          url,
          cookiesBrowser: cookies === "none" ? null : cookies,
        });
        set({ metadataPreview: metadata, metadataLoading: false });
      } catch (err: any) {
        set({ metadataError: err.toString(), metadataLoading: false });
      }
    },

    fetchPlaylistMetadata: async (url: string) => {
      set({ playlistLoading: true, playlistError: null, playlistPreview: null });
      try {
        const cookies = get().settings.cookiesBrowser;
        const metadata = await invoke<PlaylistMetadata>("fetch_playlist_metadata", {
          url,
          cookiesBrowser: cookies === "none" ? null : cookies,
        });
        set({ playlistPreview: metadata, playlistLoading: false });
      } catch (err: any) {
        set({ playlistError: err.toString(), playlistLoading: false });
      }
    },

    clearMetadata: () => {
      set({ metadataPreview: null, metadataError: null });
    },

    clearPlaylistMetadata: () => {
      set({ playlistPreview: null, playlistError: null });
    },

    queueDownload: (item) => {
      const taskId = crypto.randomUUID();
      const newDownload: DownloadItem = {
        taskId,
        url: item.url,
        title: item.title,
        thumbnail: item.thumbnail,
        uploader: item.uploader,
        duration: item.duration,
        percentage: 0,
        speed: "0B/s",
        eta: "--:--",
        status: "Queued",
        addedAt: new Date().toLocaleTimeString(),
        format: item.format,
        trimRange: item.trimRange,
        subLangs: item.subLangs,
        writeSubs: item.writeSubs,
        writeAutoSubs: item.writeAutoSubs,
        embedSubs: item.embedSubs,
        transcribe: item.transcribe,
      };

      const updatedDownloads = [newDownload, ...get().downloads];
      localStorage.setItem("vidralo_downloads", JSON.stringify(updatedDownloads));
      set({ downloads: updatedDownloads });
      
      get().processQueue();
    },

    processQueue: async () => {
      const { downloads, settings } = get();
      const activeStatuses = ["Downloading", "Merging audio/video...", "Extracting audio...", "Starting...", "Starting"];
      const activeCount = downloads.filter((d) => activeStatuses.includes(d.status)).length;
      
      if (activeCount >= settings.concurrencyLimit) return;
      
      const nextQueued = downloads.find((d) => d.status === "Queued");
      if (!nextQueued) return;
      
      set((state) => {
        const updated = state.downloads.map((d) =>
          d.taskId === nextQueued.taskId ? { ...d, status: "Starting..." } : d
        );
        localStorage.setItem("vidralo_downloads", JSON.stringify(updated));
        return { downloads: updated };
      });

      try {
        await invoke("start_download", {
          taskId: nextQueued.taskId,
          url: nextQueued.url,
          formatId: nextQueued.format,
          outputDir: settings.outputDir,
          cookiesBrowser: settings.cookiesBrowser === "none" ? null : settings.cookiesBrowser,
          filenameTemplate: settings.filenameTemplate || null,
          limitRate: settings.bandwidthThrottle || null,
          trimRange: nextQueued.trimRange || null,
          sponsorblockCategories: settings.sponsorblockEnabled ? settings.sponsorblockCategories : null,
          subLangs: nextQueued.subLangs || null,
          writeSubs: nextQueued.writeSubs || false,
          writeAutoSubs: nextQueued.writeAutoSubs || false,
          embedSubs: nextQueued.embedSubs || false,
          embedMetadata: settings.embedMetadata,
          transcribe: nextQueued.transcribe || false,
          ffmpegPath: settings.ffmpegPath || null,
          title: nextQueued.title,
          uploader: nextQueued.uploader,
          duration: nextQueued.duration,
          thumbnail: nextQueued.thumbnail,
        });
      } catch (err: any) {
        set((state) => {
          const updated = state.downloads.map((d) =>
            d.taskId === nextQueued.taskId
              ? { ...d, status: `Error: ${err.toString()}`, percentage: 0 }
              : d
          );
          localStorage.setItem("vidralo_downloads", JSON.stringify(updated));
          return { downloads: updated };
        });
        get().processQueue();
      }
    },

    cancelDownload: async (taskId: string) => {
      // If queued and not started, just cancel locally
      const item = get().downloads.find((d) => d.taskId === taskId);
      if (item && item.status === "Queued") {
        set((state) => {
          const updated = state.downloads.map((d) =>
            d.taskId === taskId ? { ...d, status: "Cancelled" } : d
          );
          localStorage.setItem("vidralo_downloads", JSON.stringify(updated));
          return { downloads: updated };
        });
        return;
      }

      try {
        await invoke("cancel_download", { taskId });
      } catch (err) {
        console.error("Cancel failed", err);
      }
    },

    clearHistory: () => {
      set((state) => {
        const updatedDownloads = state.downloads.filter(
          (d) => d.status !== "Completed" && d.status !== "Cancelled" && !d.status.startsWith("Error:") && d.status !== "Interrupted"
        );
        localStorage.setItem("vidralo_downloads", JSON.stringify(updatedDownloads));
        return { downloads: updatedDownloads };
      });
    },

    loadSettings: async () => {
      const saved = localStorage.getItem("vidralo_settings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          set((state) => ({ settings: { ...state.settings, ...parsed } }));
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }

      const savedDownloads = localStorage.getItem("vidralo_downloads");
      if (savedDownloads) {
        try {
          const parsed = JSON.parse(savedDownloads) as DownloadItem[];
          const sanitized = parsed.map((d) => {
            const isActive = d.status !== "Completed" && d.status !== "Cancelled" && !d.status.startsWith("Error:") && d.status !== "Interrupted";
            if (isActive) {
              return {
                ...d,
                status: "Interrupted",
                speed: "0B/s",
                eta: "--:--",
              };
            }
            return d;
          });
          set({ downloads: sanitized });
        } catch (e) {
          console.error("Failed to parse downloads", e);
        }
      }

      try {
        const versions = await invoke<BinaryVersions>("get_binaries_status");
        set({ binaryVersions: versions });
      } catch (err) {
        console.error("Failed to query versions", err);
      }

      await get().checkFFmpeg();
      await get().loadWhisperStatus();
      await get().loadLibrary();
      await get().loadSubscriptions();
    },

    saveSettings: (newSettings: Partial<Settings>) => {
      set((state) => {
        const updated = { ...state.settings, ...newSettings };
        localStorage.setItem("vidralo_settings", JSON.stringify(updated));
        return { settings: updated };
      });
      if (newSettings.ffmpegPath !== undefined) {
        get().checkFFmpeg();
      }
    },

    checkUpdates: async () => {
      set((state) => ({
        updateStatus: { ...state.updateStatus, checking: true },
      }));
      try {
        const result = await invoke<UpdateCheckResult>("check_for_updates");
        const available = result.yt_dlp_update_available || result.bgutil_update_available;
        set((state) => ({
          updateStatus: {
            ...state.updateStatus,
            checking: false,
            updateAvailable: available,
            checkResult: result,
          },
        }));
      } catch (err) {
        console.error("Check updates failed", err);
        set((state) => ({
          updateStatus: { ...state.updateStatus, checking: false },
        }));
      }
    },

    performUpdates: async () => {
      const result = get().updateStatus.checkResult;
      if (!result) return;

      set((state) => ({
        updateStatus: {
          ...state.updateStatus,
          updating: true,
          progressText: "Initiating updates...",
          progressPercent: 0,
        },
      }));

      try {
        const targetYt = result.yt_dlp_update_available ? result.yt_dlp_latest : "";
        const targetBg = result.bgutil_update_available ? result.bgutil_latest : "";

        await invoke("perform_updates", {
          targetYtVersion: targetYt,
          targetBgVersion: targetBg,
        });

        const versions = await invoke<BinaryVersions>("get_binaries_status");
        set({
          binaryVersions: versions,
          updateStatus: {
            checking: false,
            updateAvailable: false,
            updating: false,
            progressText: "All tools up to date!",
            progressPercent: 100,
            checkResult: null,
          },
        });
      } catch (err: any) {
        set((state) => ({
          updateStatus: {
            ...state.updateStatus,
            updating: false,
            progressText: `Update failed: ${err.toString()}`,
          },
        }));
      }
    },

    checkFFmpeg: async () => {
      const customPath = get().settings.ffmpegPath;
      try {
        const available = await invoke<boolean>("verify_ffmpeg", {
          customPath: customPath || null,
        });
        set({ ffmpegAvailable: available });
      } catch {
        set({ ffmpegAvailable: false });
      }
    },

    installPlugin: async (pluginId: string) => {
      try {
        await invoke("install_plugin", { pluginId });
      } catch (err: any) {
        throw new Error(err.toString());
      }
    },

    // Subscriptions Actions
    loadSubscriptions: async () => {
      set({ subscriptionsLoading: true });
      try {
        const subs = await invoke<Subscription[]>("get_subscriptions");
        set({ subscriptions: subs, subscriptionsLoading: false });
      } catch (err) {
        console.error("Failed to load subscriptions", err);
        set({ subscriptionsLoading: false });
      }
    },

    addSubscription: async (url: string, title: string, typeInfo: string) => {
      const newSub: Subscription = {
        url,
        title,
        type_info: typeInfo,
        archive_path: "",
        added_at: new Date().toISOString(),
        last_checked: null,
      };
      try {
        await invoke("add_subscription", { sub: newSub });
        await get().loadSubscriptions();
      } catch (err: any) {
        throw new Error(err.toString());
      }
    },

    deleteSubscription: async (url: string) => {
      try {
        await invoke("delete_subscription", { url });
        await get().loadSubscriptions();
      } catch (err) {
        console.error("Failed to delete subscription", err);
      }
    },

    checkSubscriptions: async () => {
      set({ subscriptionsLoading: true });
      const { subscriptions, settings } = get();
      
      for (const sub of subscriptions) {
        try {
          // Re-fetch listing
          const metadata = await invoke<PlaylistMetadata>("fetch_playlist_metadata", {
            url: sub.url,
            cookiesBrowser: settings.cookiesBrowser === "none" ? null : settings.cookiesBrowser,
          });

          // Check against the archive file by downloading entries
          // We queue download for each item in the playlist
          for (const entry of metadata.entries) {
            get().queueDownload({
              url: entry.url,
              title: entry.title,
              uploader: entry.uploader,
              duration: entry.duration,
              thumbnail: "", // Flat playlist doesn't always have entry thumbnails
              format: "best",
            });
          }

          // Update last checked
          const nowStr = new Date().toLocaleString();
          await invoke("update_subscription_last_checked", { url: sub.url, time: nowStr });
        } catch (err) {
          console.error(`Check subscription failed for ${sub.title}`, err);
        }
      }
      
      await get().loadSubscriptions();
      set({ subscriptionsLoading: false });
    },

    // Library & Transcription Actions
    loadLibrary: async () => {
      set({ libraryLoading: true });
      try {
        const items = await invoke<LibraryItem[]>("get_library_items");
        set({ library: items, libraryLoading: false });
      } catch (err) {
        console.error("Failed to load library items", err);
        set({ libraryLoading: false });
      }
    },

    deleteLibraryItem: async (id: string) => {
      try {
        await invoke("delete_library_item", { id });
        await get().loadLibrary();
      } catch (err) {
        console.error("Failed to delete library item", err);
      }
    },

    searchLibrary: async (query: string) => {
      if (!query.trim()) {
        set({ librarySearchResults: [], librarySearchQuery: "" });
        return;
      }
      set({ libraryLoading: true, librarySearchQuery: query });
      try {
        const results = await invoke<SearchResult[]>("search_library", { query });
        set({ librarySearchResults: results, libraryLoading: false });
      } catch (err) {
        console.error("Library search failed", err);
        set({ libraryLoading: false, librarySearchResults: [] });
      }
    },

    clearLibrarySearch: () => {
      set({ librarySearchResults: [], librarySearchQuery: "" });
    },

    loadWhisperStatus: async () => {
      try {
        const status = await invoke<WhisperStatus>("get_whisper_status");
        set({ whisperStatus: status });
      } catch (err) {
        console.error("Failed to load whisper status", err);
      }
    },

    setupWhisperBinary: async () => {
      try {
        await invoke("setup_whisper_binary");
        await get().loadWhisperStatus();
      } catch (err: any) {
        console.error("Setup whisper binary failed", err);
        set((state) => ({
          whisperProgress: {
            ...state.whisperProgress,
            setup: { progress: 0, status: `Error: ${err.message || err}` },
          },
        }));
      }
    },

    setupWhisperModel: async () => {
      try {
        await invoke("setup_whisper_model");
        await get().loadWhisperStatus();
      } catch (err: any) {
        console.error("Setup whisper model failed", err);
        set((state) => ({
          whisperProgress: {
            ...state.whisperProgress,
            setup: { progress: 0, status: `Error: ${err.message || err}` },
          },
        }));
      }
    },

    transcribeVideo: async (videoId: string, filePath: string) => {
      const ffmpeg = get().settings.ffmpegPath;
      try {
        await invoke("transcribe_video", {
          videoId,
          filePath,
          ffmpegPath: ffmpeg || null,
        });
        await get().loadLibrary();
      } catch (err: any) {
        console.error("Transcription execution failed", err);
      }
    },
  };
});
