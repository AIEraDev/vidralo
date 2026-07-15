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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub thumbnail: String,
    pub formats: Vec<FormatInfo>,
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

#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub task_id: String,
    pub percentage: f64,
    pub speed: String,
    pub eta: String,
    pub status: String,
}

pub enum ActiveProcess {
    Sidecar(tauri_plugin_shell::process::CommandChild),
    Custom(Child),
}

pub struct ActiveDownloads {
    pub processes: Arc<Mutex<HashMap<String, ActiveProcess>>>,
}

// Common output representation to unify std::process::Output and tauri_plugin_shell::process::Output
struct CommandOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

// Extractor response JSON structs
#[derive(Deserialize, Debug)]
struct YtDlpDump {
    id: String,
    title: String,
    uploader: String,
    duration: Option<f64>,
    thumbnail: Option<String>,
    formats: Option<Vec<YtDlpFormat>>,
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

#[derive(Deserialize)]
struct PotResponse {
    #[serde(rename = "poToken")]
    po_token: String,
}

// Extract video ID from common YouTube URL formats
pub fn extract_video_id(url: &str) -> Option<String> {
    let re = Regex::new(r"(?i)(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)|watch|shorts)?\??(?:.*v=)?|youtu\.be/)([^?&'\s]{11})").ok()?;
    let caps = re.captures(url)?;
    caps.get(1).map(|m| m.as_str().to_string())
}

// Get PO Token from local bgutil-pot binary
async fn get_po_token(app: &AppHandle, video_id: &str) -> Option<String> {
    let app_dir = app.path().app_data_dir().ok()?;
    let updated_path = app_dir.join("binaries").join(format!("bgutil-pot{}", get_binary_extension()));
    
    let output = if updated_path.exists() && updated_path.is_file() {
        // Run custom updated binary
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
        // Run bundled sidecar via tauri-plugin-shell
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

// Run yt-dlp --dump-json to fetch video metadata
pub async fn fetch_video_metadata(
    app: AppHandle,
    url: String,
    cookies_browser: Option<String>,
) -> Result<VideoMetadata, String> {
    let mut args = vec!["--dump-json".to_string(), "--no-warnings".to_string()];
    
    // Inject PO token if it's a YouTube video
    if let Some(video_id) = extract_video_id(&url) {
        if let Some(po_token) = get_po_token(&app, &video_id).await {
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:po_token=web.gvs+{},web.player+{}", po_token, po_token));
        }
    }
    
    // Inject browser cookies if requested
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
        // Run custom updated binary
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
        // Run bundled sidecar
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
            
            // Format resolution label
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
    
    // Fallback thumbnail
    let thumbnail_url = dump.thumbnail.unwrap_or_else(|| "".to_string());
    
    Ok(VideoMetadata {
        id: dump.id,
        title: dump.title,
        uploader: dump.uploader,
        duration: dump.duration.unwrap_or(0.0),
        thumbnail: thumbnail_url,
        formats: parsed_formats,
    })
}

// Map command errors to human-friendly strings
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
        // Return first non-empty line of error
        stderr.lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Unknown download error occurred.")
            .to_string()
    }
}

// Start download and stream progress
pub async fn start_video_download(
    app: AppHandle,
    task_id: String,
    url: String,
    format_id: String,
    output_dir: String,
    cookies_browser: Option<String>,
    filename_template: Option<String>,
) -> Result<(), String> {
    // Resolve output directory path dynamically (defaults to ~/Vidralo/Downloads)
    let resolved_out_dir = if output_dir.is_empty() {
        if let Ok(home) = app.path().home_dir() {
            home.join("Vidralo").join("Downloads")
        } else {
            app.path().download_dir().map_err(|e| e.to_string())?
        }
    } else {
        PathBuf::from(output_dir)
    };
    
    // Ensure the folder exists
    if !resolved_out_dir.exists() {
        let _ = std::fs::create_dir_all(&resolved_out_dir);
    }
    
    let template = filename_template.unwrap_or_else(|| "%(title)s [%(id)s].%(ext)s".to_string());
    let output_path = resolved_out_dir.join(&template);
    
    let mut args = vec![
        "--newline".to_string(),
        "--progress-template".to_string(),
        "download:[download] %(progress._percent_str)s | %(progress._speed_str)s | %(progress._eta_str)s".to_string(),
        "-o".to_string(),
        output_path.to_string_lossy().to_string(),
    ];
    
    // Format selection mapping
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
    
    // Inject PO token if it's a YouTube video
    if let Some(video_id) = extract_video_id(&url) {
        if let Some(po_token) = get_po_token(&app, &video_id).await {
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:po_token=web.gvs+{},web.player+{}", po_token, po_token));
        }
    }
    
    // Cookies configuration
    if let Some(browser) = cookies_browser {
        if !browser.is_empty() && browser != "none" {
            args.push("--cookies-from-browser".to_string());
            args.push(browser);
        }
    }
    
    args.push(url);
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("yt-dlp{}", get_binary_extension()));
    
    if updated_path.exists() && updated_path.is_file() {
        // Execute updated binary via Tokio Command
        let mut child = Command::new(updated_path)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn download process: {}", e))?;
            
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        
        // Register active download
        let active_downloads: State<'_, ActiveDownloads> = app.state();
        {
            let mut processes = active_downloads.processes.lock().unwrap();
            processes.insert(task_id.clone(), ActiveProcess::Custom(child));
        }
        
        let app_clone = app.clone();
        let task_id_clone = task_id.clone();
        
        // Parse progress and stream it
        let stdout_handler = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let progress_regex = Regex::new(r"\[download\]\s+([\d.]+)\%\s+\|\s+(\S+)\s+\|\s+(\S+)").unwrap();
            
            while let Ok(Some(line)) = lines.next_line().await {
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
                    });
                } else if line.contains("[Merger]") {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Merging audio/video...".to_string(),
                    });
                } else if line.contains("[ExtractAudio]") {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Extracting audio...".to_string(),
                    });
                }
            }
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
        
        // Spawn lifecycle manager task
        tokio::spawn(async move {
            let active_downloads: State<'_, ActiveDownloads> = app.state();
            let mut process = {
                let mut processes = active_downloads.processes.lock().unwrap();
                processes.remove(&task_id)
            };
            
            if let Some(ActiveProcess::Custom(ref mut p)) = process {
                let status = p.wait().await;
                let _ = stdout_handler.await;
                let _ = stderr_handler.await;
                
                match status {
                    Ok(exit_status) if exit_status.success() => {
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 100.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: "Completed".to_string(),
                        });
                    }
                    Ok(exit_status) => {
                        let errors = stderr_lines.lock().unwrap();
                        let full_stderr = errors.join("\n");
                        let err_msg = if exit_status.code() == Some(101) {
                            "Download cancelled by user.".to_string()
                        } else {
                            parse_error_message(&full_stderr)
                        };
                        
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 0.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: format!("Error: {}", err_msg),
                        });
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        let _ = app.emit("download://progress", DownloadProgress {
                            task_id: task_id.clone(),
                            percentage: 0.0,
                            speed: "0B/s".to_string(),
                            eta: "00:00".to_string(),
                            status: format!("Error: {}", err_msg),
                        });
                    }
                }
            }
        });
        
        Ok(())
    } else {
        // Execute bundled sidecar via tauri-plugin-shell
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
            .args(&args);
            
        let (mut rx, child) = sidecar.spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
            
        // Register active download
        let active_downloads: State<'_, ActiveDownloads> = app.state();
        {
            let mut processes = active_downloads.processes.lock().unwrap();
            processes.insert(task_id.clone(), ActiveProcess::Sidecar(child));
        }
        
        let app_clone = app.clone();
        let task_id_clone = task_id.clone();
        let stderr_lines = Arc::new(Mutex::new(Vec::new()));
        let stderr_lines_clone = Arc::clone(&stderr_lines);
        
        tokio::spawn(async move {
            let progress_regex = Regex::new(r"\[download\]\s+([\d.]+)\%\s+\|\s+(\S+)\s+\|\s+(\S+)").unwrap();
            let mut exit_code = None;
            
            while let Some(event) = rx.recv().await {
                match event {
                    tauri_plugin_shell::process::CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
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
                            });
                        } else if line.contains("[Merger]") {
                            let _ = app_clone.emit("download://progress", DownloadProgress {
                                task_id: task_id_clone.clone(),
                                percentage: 100.0,
                                speed: "0B/s".to_string(),
                                eta: "00:00".to_string(),
                                status: "Merging audio/video...".to_string(),
                            });
                        } else if line.contains("[ExtractAudio]") {
                            let _ = app_clone.emit("download://progress", DownloadProgress {
                                task_id: task_id_clone.clone(),
                                percentage: 100.0,
                                speed: "0B/s".to_string(),
                                eta: "00:00".to_string(),
                                status: "Extracting audio...".to_string(),
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
            
            // Clean up process from active map
            let active_downloads: State<'_, ActiveDownloads> = app_clone.state();
            {
                let mut processes = active_downloads.processes.lock().unwrap();
                processes.remove(&task_id_clone);
            }
            
            match exit_code {
                Some(0) => {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 100.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Completed".to_string(),
                    });
                }
                Some(code) => {
                    let errors = stderr_lines.lock().unwrap();
                    let full_stderr = errors.join("\n");
                    let err_msg = if code == 101 {
                        "Download cancelled by user.".to_string()
                    } else {
                        parse_error_message(&full_stderr)
                    };
                    
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 0.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: format!("Error: {}", err_msg),
                    });
                }
                None => {
                    let _ = app_clone.emit("download://progress", DownloadProgress {
                        task_id: task_id_clone.clone(),
                        percentage: 0.0,
                        speed: "0B/s".to_string(),
                        eta: "00:00".to_string(),
                        status: "Error: Process terminated abnormally".to_string(),
                    });
                }
            }
        });
        
        Ok(())
    }
}

// Cancel active download
pub async fn cancel_video_download(app: AppHandle, task_id: String) -> Result<(), String> {
    let active_downloads: State<'_, ActiveDownloads> = app.state();
    let process = {
        let mut processes = active_downloads.processes.lock().unwrap();
        processes.remove(&task_id)
    };
    
    if let Some(p) = process {
        match p {
            ActiveProcess::Sidecar(child) => {
                child.kill().map_err(|e| format!("Failed to kill sidecar: {}", e))?;
            }
            ActiveProcess::Custom(mut child) => {
                child.kill().await.map_err(|e| format!("Failed to kill custom process: {}", e))?;
            }
        }
        let _ = app.emit("download://progress", DownloadProgress {
            task_id,
            percentage: 0.0,
            speed: "0B/s".to_string(),
            eta: "00:00".to_string(),
            status: "Cancelled".to_string(),
        });
        Ok(())
    } else {
        Err("No active process found for this task ID.".to_string())
    }
}
