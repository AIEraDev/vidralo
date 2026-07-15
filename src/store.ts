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
}

export interface Settings {
  outputDir: string;
  ffmpegPath: string;
  cookiesBrowser: string;
  poTokenEnabled: boolean;
}

interface DownloadProgressPayload {
  task_id: string;
  percentage: number;
  speed: string;
  eta: string;
  status: string;
}

interface UpdateProgressPayload {
  binary: string;
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

interface StoreState {
  downloads: DownloadItem[];
  metadataPreview: VideoMetadata | null;
  metadataLoading: boolean;
  metadataError: string | null;
  settings: Settings;
  binaryVersions: BinaryVersions;
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
  clearMetadata: () => void;
  startDownload: (url: string, formatId: string) => Promise<void>;
  cancelDownload: (taskId: string) => Promise<void>;
  clearHistory: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<Settings>) => void;
  checkUpdates: () => Promise<void>;
  performUpdates: () => Promise<void>;
  checkFFmpeg: () => Promise<void>;
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
          };
        }
        return d;
      });
      return { downloads: updatedDownloads };
    });
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

  return {
    downloads: [],
    metadataPreview: null,
    metadataLoading: false,
    metadataError: null,
    settings: {
      outputDir: "",
      ffmpegPath: "",
      cookiesBrowser: "none",
      poTokenEnabled: true,
    },
    binaryVersions: {
      yt_dlp: "Loading...",
      bgutil_pot: "Loading...",
    },
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

    clearMetadata: () => {
      set({ metadataPreview: null, metadataError: null });
    },

    startDownload: async (url: string, formatId: string) => {
      const metadata = get().metadataPreview;
      if (!metadata) return;

      const taskId = crypto.randomUUID();
      const outputDir = get().settings.outputDir;
      const cookies = get().settings.cookiesBrowser;

      const newDownload: DownloadItem = {
        taskId,
        url,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        uploader: metadata.uploader,
        duration: metadata.duration,
        percentage: 0,
        speed: "0B/s",
        eta: "--:--",
        status: "Starting...",
        addedAt: new Date().toLocaleTimeString(),
        format: formatId,
      };

      set((state) => ({
        downloads: [newDownload, ...state.downloads],
        metadataPreview: null, // Clear preview after starting download
      }));

      try {
        await invoke("start_download", {
          taskId,
          url,
          formatId,
          outputDir,
          cookiesBrowser: cookies === "none" ? null : cookies,
          filenameTemplate: null,
        });
      } catch (err: any) {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.taskId === taskId
              ? { ...d, status: `Error: ${err.toString()}`, percentage: 0 }
              : d
          ),
        }));
      }
    },

    cancelDownload: async (taskId: string) => {
      try {
        await invoke("cancel_download", { taskId });
      } catch (err) {
        console.error("Cancel failed", err);
      }
    },

    clearHistory: () => {
      set((state) => ({
        downloads: state.downloads.filter(
          (d) => d.status !== "Completed" && d.status !== "Cancelled" && !d.status.startsWith("Error:")
        ),
      }));
    },

    loadSettings: async () => {
      // Load from localStorage
      const saved = localStorage.getItem("vidralo_settings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          set((state) => ({ settings: { ...state.settings, ...parsed } }));
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }

      // Query versions from Rust
      try {
        const versions = await invoke<BinaryVersions>("get_binaries_status");
        set({ binaryVersions: versions });
      } catch (err) {
        console.error("Failed to query versions", err);
      }

      // Check FFmpeg
      await get().checkFFmpeg();
    },

    saveSettings: (newSettings: Partial<Settings>) => {
      set((state) => {
        const updated = { ...state.settings, ...newSettings };
        localStorage.setItem("vidralo_settings", JSON.stringify(updated));
        return { settings: updated };
      });
      // Re-check FFmpeg if path changed
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

        // Re-read versions
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
  };
});
