use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Emitter, State};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Command, Child};
use regex::Regex;
use serde::{Serialize, Deserialize};

use crate::updater::get_binary_extension;
use crate::db::{self, LibraryItem};
use crate::transcribe;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub thumbnail: String,
    pub formats: Vec<FormatInfo>,
    pub subtitles: Vec<String>,
    pub auto_subs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub filesize: Option<u64>,
    pub is_video: bool,
    pub is_audio: bool,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaylistMetadata {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub entries: Vec<PlaylistItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaylistItem {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub url: String,
}

#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub task_id: String,
    pub percentage: f64,
    pub speed: String,
    pub eta: String,
    pub status: String,
    pub file_path: Option<String>,
    pub sponsorblock_skipped: i32,
}

pub enum ActiveProcess {
    Sidecar(tauri_plugin_shell::process::CommandChild),
    Custom(Child),
}

pub struct ActiveDownloads {
    pub processes: Arc<Mutex<HashMap<String, ActiveProcess>>>,
}

struct CommandOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

#[derive(Deserialize, Debug)]
struct YtDlpDump {
    id: String,
    title: String,
    uploader: String,
    duration: Option<f64>,
    thumbnail: Option<String>,
    formats: Option<Vec<YtDlpFormat>>,
    subtitles: Option<HashMap<String, serde_json::Value>>,
    automatic_captions: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Deserialize, Debug)]
struct YtDlpFormat {
    format_id: String,
    ext: String,
    resolution: Option<String>,
    filesize: Option<u64>,
    filesize_approx: Option<u64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    format_note: Option<String>,
}

#[derive(Deserialize, Debug)]
struct YtDlpPlaylistDump {
    id: String,
    title: Option<String>,
    uploader: Option<String>,
    entries: Option<Vec<YtDlpPlaylistEntry>>,
    duration: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct YtDlpPlaylistEntry {
    id: String,
    title: Option<String>,
    uploader: Option<String>,
    duration: Option<f64>,
    url: Option<String>,
}

#[derive(Deserialize)]
struct PotResponse {
    #[serde(rename = "poToken")]
    po_token: String,
}

pub fn extract_video_id(url: &str) -> Option<String> {
    let re = Regex::new(r"(?i)(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)|watch|shorts)?\??(?:.*v=)?|youtu\.be/)([^?&'\s]{11})").ok()?;
    let caps = re.captures(url)?;
    caps.get(1).map(|m| m.as_str().to_string())
}

async fn get_po_token(app: &AppHandle, video_id: &str) -> Option<String> {
    let app_dir = app.path().app_data_dir().ok()?;
    let updated_path = app_dir.join("binaries").join(format!("bgutil-pot{}", get_binary_extension()));
    
    let output = if updated_path.exists() && updated_path.is_file() {
        let out = Command::new(updated_path)
            .args(["--content-binding", video_id])
            .output()
            .await
            .ok()?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    } else {
        let sidecar = app.shell().sidecar("bgutil-pot").ok()?
            .args(["--content-binding", video_id]);
        let out = sidecar.output().await.ok()?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    };
        
    if output.success {
        let json_str = String::from_utf8_lossy(&output.stdout);
        let res: PotResponse = serde_json::from_str(&json_str).ok()?;
        Some(res.po_token)
    } else {
        None
    }
}

pub async fn fetch_video_metadata(
    app: AppHandle,
    url: String,
    cookies_browser: Option<String>,
) -> Result<VideoMetadata, String> {
    let mut args = vec!["--dump-json".to_string(), "--no-warnings".to_string()];
    
    if let Some(video_id) = extract_video_id(&url) {
        if let Some(po_token) = get_po_token(&app, &video_id).await {
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:po_token=web.gvs+{},web.player+{}", po_token, po_token));
        }
    }
    
    if let Some(browser) = cookies_browser {
        if !browser.is_empty() && browser != "none" {
            args.push("--cookies-from-browser".to_string());
            args.push(browser);
        }
    }
    
    args.push(url.clone());
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("yt-dlp{}", get_binary_extension()));
    
    let output = if updated_path.exists() && updated_path.is_file() {
        let out = Command::new(updated_path)
            .args(&args)
            .output()
            .await
            .map_err(|e| format!("Failed to execute updated yt-dlp: {}", e))?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    } else {
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
            .args(&args);
        let out = sidecar.output().await
            .map_err(|e| format!("Failed to execute sidecar yt-dlp: {}", e))?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    };
        
    if !output.success {
        let err_str = String::from_utf8_lossy(&output.stderr);
        return Err(parse_error_message(&err_str));
    }
    
    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let dump: YtDlpDump = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse metadata JSON: {}", e))?;
        
    let mut parsed_formats = Vec::new();
    if let Some(formats) = dump.formats {
        for f in formats {
            let is_video = f.vcodec.as_ref().map(|c| c != "none").unwrap_or(false);
            let is_audio = f.acodec.as_ref().map(|c| c != "none").unwrap_or(false);
            
            let resolution = if is_video {
                f.resolution.clone().unwrap_or_else(|| {
                    if let Some(note) = &f.format_note {
                        note.clone()
                    } else {
                        "video only".to_string()
                    }
                })
            } else {
                "audio only".to_string()
            };
            
            parsed_formats.push(FormatInfo {
                format_id: f.format_id,
                ext: f.ext,
                resolution,
                filesize: f.filesize.or(f.filesize_approx),
                is_video,
                is_audio,
                note: f.format_note,
            });
        }
    }
    
    let subs = dump.subtitles.map(|m| m.keys().cloned().collect()).unwrap_or_default();
    let auto_subs = dump.automatic_captions.map(|m| m.keys().cloned().collect()).unwrap_or_default();
    let thumbnail_url = dump.thumbnail.unwrap_or_else(|| "".to_string());
    
    Ok(VideoMetadata {
        id: dump.id,
        title: dump.title,
        uploader: dump.uploader,
        duration: dump.duration.unwrap_or(0.0),
        thumbnail: thumbnail_url,
        formats: parsed_formats,
        subtitles: subs,
        auto_subs,
    })
}

// Flat playlist lookup for channels and playlists
pub async fn fetch_playlist_metadata(
    app: AppHandle,
    url: String,
    cookies_browser: Option<String>,
) -> Result<PlaylistMetadata, String> {
    let mut args = vec![
        "--flat-playlist".to_string(),
        "--dump-single-json".to_string(),
        "--no-warnings".to_string(),
    ];
    
    if let Some(browser) = cookies_browser {
        if !browser.is_empty() && browser != "none" {
            args.push("--cookies-from-browser".to_string());
            args.push(browser);
        }
    }
    
    args.push(url.clone());
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("yt-dlp{}", get_binary_extension()));
    
    let output = if updated_path.exists() && updated_path.is_file() {
        let out = Command::new(updated_path)
            .args(&args)
            .output()
            .await
            .map_err(|e| format!("Failed to execute updated yt-dlp: {}", e))?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    } else {
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
            .args(&args);
        let out = sidecar.output().await
            .map_err(|e| format!("Failed to execute sidecar yt-dlp: {}", e))?;
        CommandOutput {
            success: out.status.success(),
            stdout: out.stdout,
            stderr: out.stderr,
        }
    };
        
    if !output.success {
        let err_str = String::from_utf8_lossy(&output.stderr);
        return Err(parse_error_message(&err_str));
    }
    
    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let dump: YtDlpPlaylistDump = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse playlist JSON: {}", e))?;
        
    let mut entries = Vec::new();
    if let Some(dump_entries) = dump.entries {
        for entry in dump_entries {
            entries.push(PlaylistItem {
                id: entry.id.clone(),
                title: entry.title.unwrap_or_else(|| "Unknown Video".to_string()),
                uploader: entry.uploader.unwrap_or_else(|| dump.uploader.clone().unwrap_or_else(|| "Unknown".to_string())),
                duration: entry.duration.unwrap_or(0.0),
                url: entry.url.unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", entry.id)),
            });
        }
    } else {
        // Single video URL passed to playlist metadata
        entries.push(PlaylistItem {
            id: dump.id.clone(),
            title: dump.title.clone().unwrap_or_else(|| "Unknown Video".to_string()),
            uploader: dump.uploader.clone().unwrap_or_else(|| "Unknown".to_string()),
            duration: dump.duration.unwrap_or(0.0),
            url: url.clone(),
        });
    }
    
    Ok(PlaylistMetadata {
        id: dump.id,
        title: dump.title.unwrap_or_else(|| "Playlist / Channel".to_string()),
        uploader: dump.uploader.unwrap_or_else(|| "Unknown".to_string()),
        entries,
    })
}

pub fn parse_error_message(stderr: &str) -> String {
    if stderr.contains("Sign in to confirm you're not a bot") || stderr.contains("bot") {
        "YouTube bot detection triggered. Try enabling browser cookies in Settings, or try again later.".to_string()
    } else if stderr.contains("Video unavailable") || stderr.contains("Private video") {
        "This video is private or unavailable.".to_string()
    } else if stderr.contains("Geo-restricted") || stderr.contains("geographic") {
        "This video is geo-restricted in your region.".to_string()
    } else if stderr.contains("Unsupported URL") {
        "The URL is not supported by yt-dlp.".to_string()
    } else {
        stderr.lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Unknown download error occurred.")
            .to_string()
    }
}

pub async fn start_video_download(
    app: AppHandle,
    task_id: String,
    url: String,
    format_id: String,
    output_dir: String,
    cookies_browser: Option<String>,
    filename_template: Option<String>,
    // Advanced features
    limit_rate: Option<String>,
    trim_range: Option<String>,
    sponsorblock_categories: Option<Vec<String>>,
    sub_langs: Option<Vec<String>>,
    write_subs: bool,
    write_auto_subs: bool,
    embed_subs: bool,
    embed_metadata: bool,
    transcribe: bool,
    ffmpeg_path: Option<String>,
    title: String,
    uploader: String,
    duration: f64,
    thumbnail: String,
) -> Result<(), String> {
    let resolved_out_dir = if output_dir.is_empty() {
        if let Ok(home) = app.path().home_dir() {
            home.join("Vidralo").join("Downloads")
        } else {
            app.path().download_dir().map_err(|e| e.to_string())?
        }
    } else {
        PathBuf::from(output_dir)
    };
    
    if !resolved_out_dir.exists() {
        let _ = std::fs::create_dir_all(&resolved_out_dir);
    }
    
    let template = filename_template.unwrap_or_else(|| "%(title)s [%(id)s].%(ext)s".to_string());
    let output_path = resolved_out_dir.join(&template);
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Add library item initially to SQLite
    let initial_item = LibraryItem {
        id: task_id.clone(),
        title: title.clone(),
        uploader: uploader.clone(),
        duration,
        thumbnail: thumbnail.clone(),
        url: url.clone(),
        file_path: None,
        status: "Starting...".to_string(),
        added_at: chrono::Local::now().to_rfc3339(),
        format: format_id.clone(),
        transcript_status: if transcribe { "queued".to_string() } else { "none".to_string() },
    };
    let _ = db::add_library_item(&app_dir, &initial_item);
    
    // Configure deduplication archive
    let archive_path = app_dir.join("download_archive.txt");
    
    let mut args = vec![
        "--newline".to_string(),
        "--progress-template".to_string(),
        "download:[download] %(progress._percent_str)s | %(progress._speed_str)s | %(progress._eta_str)s".to_string(),
        "-o".to_string(),
        output_path.to_string_lossy().to_string(),
        "--download-archive".to_string(),
        archive_path.to_string_lossy().to_string(),
    ];
    
    // Configure FFmpeg location
    if let Some(ref path) = ffmpeg_path {
        if !path.is_empty() {
            args.push("--ffmpeg-location".to_string());
            args.push(path.clone());
        } else if let Ok(bundled_ffmpeg) = crate::updater::get_ffmpeg_path(&app) {
            args.push("--ffmpeg-location".to_string());
            args.push(bundled_ffmpeg.to_string_lossy().to_string());
        }
    } else if let Ok(bundled_ffmpeg) = crate::updater::get_ffmpeg_path(&app) {
        args.push("--ffmpeg-location".to_string());
        args.push(bundled_ffmpeg.to_string_lossy().to_string());
    }
    
    // Metadata/thumbnail/chapters embedding
    if embed_metadata {
        args.push("--embed-metadata".to_string());
        args.push("--embed-thumbnail".to_string());
        args.push("--embed-chapters".to_string());
    }
    
    // Throttling
    if let Some(rate) = limit_rate {
        if !rate.is_empty() && rate != "unlimited" {
            args.push("--limit-rate".to_string());
            args.push(rate);
        }
    }
    
    // Clip Trimming
    if let Some(trim) = trim_range {
        if !trim.is_empty() {
            args.push("--download-sections".to_string());
            args.push(format!("*{}", trim));
        }
    }
    
    // SponsorBlock
    if let Some(sb_cats) = sponsorblock_categories {
        if !sb_cats.is_empty() {
            args.push("--sponsorblock-remove".to_string());
            args.push(sb_cats.join(","));
        }
    }
    
    // Subtitles
    if let Some(langs) = sub_langs {
        if !langs.is_empty() {
            args.push("--sub-langs".to_string());
            args.push(langs.join(","));
            if write_subs {
                args.push("--write-subs".to_string());
            }
            if write_auto_subs {
                args.push("--write-auto-subs".to_string());
            }
            if embed_subs {
                args.push("--embed-subs".to_string());
            }
            args.push("--convert-subs".to_string());
            args.push("srt".to_string());
        }
    }
    
    // Format selection
    if format_id == "best" {
        args.push("-f".to_string());
        args.push("bestvideo+bestaudio/best".to_string());
    } else if format_id == "1080p" {
        args.push("-f".to_string());
        args.push("bestvideo[height<=1080]+bestaudio/best".to_string());
    } else if format_id == "720p" {
        args.push("-f".to_string());
        args.push("bestvideo[height<=720]+bestaudio/best".to_string());
    } else if format_id == "480p" {
        args.push("-f".to_string());
        args.push("bestvideo[height<=480]+bestaudio/best".to_string());
    } else if format_id == "mp3" {
        args.push("-f".to_string());
        args.push("bestaudio".to_string());
        args.push("--extract-audio".to_string());
        args.push("--audio-format".to_string());
        args.push("mp3".to_string());
    } else if format_id == "m4a" {
        args.push("-f".to_string());
        args.push("bestaudio[ext=m4a]/bestaudio".to_string());
    } else {
        args.push("-f".to_string());
        args.push(format_id);
    }
    
    if let Some(video_id) = extract_video_id(&url) {
        if let Some(po_token) = get_po_token(&app, &video_id).await {
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:po_token=web.gvs+{},web.player+{}", po_token, po_token));
        }
    }
    
    if let Some(browser) = cookies_browser {
        if !browser.is_empty() && browser != "none" {
            args.push("--cookies-from-browser".to_string());
            args.push(browser);
        }
    }
    
    args.push(url.clone());
    
    let updated_path = app_dir.join("binaries").join(format!("yt-dlp{}", get_binary_extension()));
    
    if updated_path.exists() && updated_path.is_file() {
        let mut child = Command::new(updated_path)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn download process: {}", e))?;
            
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        
        let active_downloads: State<'_, ActiveDownloads> = app.state();
        {
            let mut processes = active_downloads.processes.lock().unwrap();
            processes.insert(task_id.clone(), ActiveProcess::Custom(child));
        }
        
        let app_clone = app.clone();
        let task_id_clone = task_id.clone();
        let ffmpeg_path_clone = ffmpeg_path.clone();
        
        let stdout_handler = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let progress_regex = Regex::new(r"\[download\]\s+([\d.]+)\%\s+\|\s+(\S+)\s+\|\s+(\S+)").unwrap();
            let mut file_path = None;
            let mut sponsorblock_count = 0;
            
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("[SponsorBlock] Removing") {
                    sponsorblock_count += 1;
                }
                
                if line.contains("Destination: ") {
                    if let Some(pos) = line.find("Destination: ") {
                        let path = line[pos + 13..].trim().to_string();
                        file_path = Some(path);
                    }
                } else if line.contains("has already been downloaded") {
                    if let Some(pos) = line.find("[download] ") {
                        if let Some(end) = line.find(" has already been downloaded") {
                            let path = line[pos + 11..end].trim().to_string();
                            file_path = Some(path);
                        }
                    }
                } else if line.contains("Merging formats into ") {
                    if let Some(pos) = line.find("Merging formats into ") {
                        let path = line[pos + 21..].trim().trim_matches('"').to_string();
                        file_path = Some(path);
                    }
                }
                
                if let Some(caps) = progress_regex.captures(&line) {
                    let percentage = caps.get(1).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);
                    let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_else(|| "0B/s".to_string());
                    let eta = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_else(|| "00:00".to_string());
                    
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage,
                        speed,
                        eta,
                        status: "Downloading".to_string(),
                        file_path: None,
                        sponsorblock_skipped: sponsorblock_count,
                    });
                } else if line.contains("[Merger]") {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Merging audio/video...".to_string(),
                        file_path: None,
                        sponsorblock_skipped: sponsorblock_count,
                    });
                } else if line.contains("[ExtractAudio]") {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Extracting audio...".to_string(),
                        file_path: None,
                        sponsorblock_skipped: sponsorblock_count,
                    });
                }
            }
            (file_path, sponsorblock_count)
        });
        
        let stderr_lines = Arc::new(Mutex::new(Vec::new()));
        let stderr_lines_clone = Arc::clone(&stderr_lines);
        
        let stderr_handler = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut errors = stderr_lines_clone.lock().unwrap();
                errors.push(line);
            }
        });
        
        tokio::spawn(async move {
            let active_downloads: State<'_, ActiveDownloads> = app.state();
            let mut process = {
                let mut processes = active_downloads.processes.lock().unwrap();
                processes.remove(&task_id)
            };
            
            if let Some(ActiveProcess::Custom(ref mut p)) = process {
                let status = p.wait().await;
                let (file_path, sponsorblock_skipped) = stdout_handler.await.unwrap_or((None, 0));
                let _ = stderr_handler.await;
                let app_dir = app.path().app_data_dir().unwrap();
                
                match status {
                    Ok(exit_status) if exit_status.success() => {
                        let status_text = if sponsorblock_skipped > 0 {
                            format!("Completed (Skipped {} SponsorBlock segments)", sponsorblock_skipped)
                        } else {
                            "Completed".to_string()
                        };
                        
                        let _ = db::update_library_item_status(&app_dir, &task_id, &status_text, file_path.as_deref());
                        
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 100.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: status_text,
                            file_path: file_path.clone(),
                            sponsorblock_skipped,
                        });
                        
                        if transcribe && file_path.is_some() {
                            let video_id_clone = task_id.clone();
                            let file_path_val = file_path.unwrap();
                            let app_clone = app.clone();
                            let ffmpeg_path_clone = ffmpeg_path_clone.clone();
                            tokio::spawn(async move {
                                let _ = db::update_library_item_transcript_status(&app_dir, &video_id_clone, "transcribing");
                                if let Err(e) = transcribe::run_transcription(app_clone.clone(), video_id_clone.clone(), file_path_val, ffmpeg_path_clone).await {
                                    let _ = db::update_library_item_transcript_status(&app_dir, &video_id_clone, "failed");
                                    println!("Transcription failed: {}", e);
                                }
                            });
                        }
                    }
                    Ok(exit_status) => {
                        let errors = stderr_lines.lock().unwrap();
                        let full_stderr = errors.join("\n");
                        let err_msg = if exit_status.code() == Some(101) {
                            "Download cancelled by user.".to_string()
                        } else {
                            parse_error_message(&full_stderr)
                        };
                        
                        let _ = db::update_library_item_status(&app_dir, &task_id, &format!("Error: {}", err_msg), None);
                        
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 0.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: format!("Error: {}", err_msg),
                            file_path: None,
                            sponsorblock_skipped: 0,
                        });
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        let _ = db::update_library_item_status(&app_dir, &task_id, &format!("Error: {}", err_msg), None);
                        
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 0.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: format!("Error: {}", err_msg),
                            file_path: None,
                            sponsorblock_skipped: 0,
                        });
                    }
                }
            }
        });
        
        Ok(())
    } else {
        // If sidecar is executed
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
            .args(&args);
            
        let (mut rx, child) = sidecar.spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
            
        let active_downloads: State<'_, ActiveDownloads> = app.state();
        {
            let mut processes = active_downloads.processes.lock().unwrap();
            processes.insert(task_id.clone(), ActiveProcess::Sidecar(child));
        }
        
        let app_clone = app.clone();
        let task_id_clone = task_id.clone();
        let ffmpeg_path_clone = ffmpeg_path.clone();
        let stderr_lines = Arc::new(Mutex::new(Vec::new()));
        let stderr_lines_clone = Arc::clone(&stderr_lines);
        
        tokio::spawn(async move {
            let progress_regex = Regex::new(r"\[download\]\s+([\d.]+)\%\s+\|\s+(\S+)\s+\|\s+(\S+)").unwrap();
            let mut exit_code = None;
            let mut file_path = None;
            let mut sponsorblock_skipped = 0;
            
            while let Some(event) = rx.recv().await {
                match event {
                    tauri_plugin_shell::process::CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        if line.contains("[SponsorBlock] Removing") {
                            sponsorblock_skipped += 1;
                        }
                        
                        if line.contains("Destination: ") {
                            if let Some(pos) = line.find("Destination: ") {
                                let path = line[pos + 13..].trim().to_string();
                                file_path = Some(path);
                            }
                        } else if line.contains("has already been downloaded") {
                            if let Some(pos) = line.find("[download] ") {
                                if let Some(end) = line.find(" has already been downloaded") {
                                    let path = line[pos + 11..end].trim().to_string();
                                    file_path = Some(path);
                                }
                            }
                        } else if line.contains("Merging formats into ") {
                            if let Some(pos) = line.find("Merging formats into ") {
                                let path = line[pos + 21..].trim().trim_matches('"').to_string();
                                file_path = Some(path);
                            }
                        }
                        
                        if let Some(caps) = progress_regex.captures(&line) {
                            let percentage = caps.get(1).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);
                            let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_else(|| "0B/s".to_string());
                            let eta = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_else(|| "00:00".to_string());
                            
                            let _ = app_clone.emit("download://progress", DownloadProgress {
                                task_id: task_id_clone.clone(),
                                percentage,
                                speed,
                                eta,
                                status: "Downloading".to_string(),
                                file_path: None,
                                sponsorblock_skipped,
                            });
                        } else if line.contains("[Merger]") {
                            let _ = app_clone.emit("download://progress", DownloadProgress {
                                task_id: task_id_clone.clone(),
                                percentage: 100.0,
                                speed: "0B/s".to_string(),
                                eta: "00:00".to_string(),
                                status: "Merging audio/video...".to_string(),
                                file_path: None,
                                sponsorblock_skipped,
                            });
                        } else if line.contains("[ExtractAudio]") {
                            let _ = app_clone.emit("download://progress", DownloadProgress {
                                task_id: task_id_clone.clone(),
                                percentage: 100.0,
                                speed: "0B/s".to_string(),
                                eta: "00:00".to_string(),
                                status: "Extracting audio...".to_string(),
                                file_path: None,
                                sponsorblock_skipped,
                            });
                        }
                    }
                    tauri_plugin_shell::process::CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes).into_owned();
                        let mut errors = stderr_lines_clone.lock().unwrap();
                        errors.push(line);
                    }
                    tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                        exit_code = payload.code;
                        break;
                    }
                    _ => {}
                }
            }
            
            let active_downloads: State<'_, ActiveDownloads> = app_clone.state();
            {
                let mut processes = active_downloads.processes.lock().unwrap();
                processes.remove(&task_id_clone);
            }
            
            let app_dir = app_clone.path().app_data_dir().unwrap();
            
            match exit_code {
                Some(0) => {
                    let status_text = if sponsorblock_skipped > 0 {
                        format!("Completed (Skipped {} SponsorBlock segments)", sponsorblock_skipped)
                    } else {
                        "Completed".to_string()
                    };
                    
                    let _ = db::update_library_item_status(&app_dir, &task_id_clone, &status_text, file_path.as_deref());
                    
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: status_text,
                        file_path: file_path.clone(),
                        sponsorblock_skipped,
                    });
                    
                    if transcribe && file_path.is_some() {
                        let video_id_clone = task_id_clone.clone();
                        let file_path_val = file_path.unwrap();
                        let app_inner = app_clone.clone();
                        tokio::spawn(async move {
                            let _ = db::update_library_item_transcript_status(&app_dir, &video_id_clone, "transcribing");
                            if let Err(e) = transcribe::run_transcription(app_inner.clone(), video_id_clone.clone(), file_path_val, ffmpeg_path_clone).await {
                                let _ = db::update_library_item_transcript_status(&app_dir, &video_id_clone, "failed");
                                println!("Transcription failed: {}", e);
                            }
                        });
                    }
                }
                Some(code) => {
                    let errors = stderr_lines.lock().unwrap();
                    let full_stderr = errors.join("\n");
                    let err_msg = if code == 101 {
                        "Download cancelled by user.".to_string()
                    } else {
                        parse_error_message(&full_stderr)
                    };
                    
                    let _ = db::update_library_item_status(&app_dir, &task_id_clone, &format!("Error: {}", err_msg), None);
                    
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 0.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: format!("Error: {}", err_msg),
                        file_path: None,
                        sponsorblock_skipped: 0,
                    });
                }
                None => {
                    let _ = db::update_library_item_status(&app_dir, &task_id_clone, "Error: Process terminated abnormally", None);
                    
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 0.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Error: Process terminated abnormally".to_string(),
                        file_path: None,
                        sponsorblock_skipped: 0,
                    });
                }
            }
        });
        
        Ok(())
    }
}

pub async fn cancel_video_download(app: AppHandle, task_id: String) -> Result<(), String> {
    let active_downloads: State<'_, ActiveDownloads> = app.state();
    let process = {
        let mut processes = active_downloads.processes.lock().unwrap();
        processes.remove(&task_id)
    };
    
    if let Some(p) = process {
        match p {
            ActiveProcess::Sidecar(child) => {
                let _ = child.kill();
            }
            ActiveProcess::Custom(mut child) => {
                let _ = child.kill().await;
            }
        }
        
        let app_dir = app.path().app_data_dir().unwrap();
        let _ = db::update_library_item_status(&app_dir, &task_id, "Cancelled", None);
        
        let _ = app.emit("download://progress", DownloadProgress {
            task_id,
            percentage: 0.0,
            speed: "0B/s".to_string(),
            eta: "00:00".to_string(),
            status: "Cancelled".to_string(),
            file_path: None,
            sponsorblock_skipped: 0,
        });
        Ok(())
    } else {
        Err("No active process found for this task ID.".to_string())
    }
}
