use std::path::PathBuf;
use std::fs::{self, File};
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};
use serde::{Serialize, Deserialize};
use futures_util::StreamExt;
use tokio::process::Command;

use crate::db::{self, TranscriptSegment};
use crate::updater::get_binary_extension;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WhisperStatus {
    pub binary_available: bool,
    pub model_available: bool,
}

#[derive(Serialize, Clone)]
pub struct TranscribeProgress {
    pub video_id: String,
    pub progress: f64,
    pub status: String,
}

// Whisper JSON schema definitions
#[derive(Deserialize, Debug)]
struct WhisperOffsets {
    from: i64,
    to: i64,
}

#[derive(Deserialize, Debug)]
struct WhisperSegment {
    offsets: WhisperOffsets,
    text: String,
}

#[derive(Deserialize, Debug)]
struct WhisperResultBlock {
    transcription: Vec<WhisperSegment>,
}

#[derive(Deserialize, Debug)]
struct WhisperJsonOutput {
    result: WhisperResultBlock,
}

pub fn get_whisper_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let whisper_dir = app_dir.join("whisper");
    if !whisper_dir.exists() {
        fs::create_dir_all(&whisper_dir).map_err(|e| e.to_string())?;
    }
    Ok(whisper_dir)
}

pub fn get_whisper_cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    let whisper_dir = get_whisper_dir(app)?;
    Ok(whisper_dir.join(format!("whisper-cli{}", get_binary_extension())))
}

pub fn get_whisper_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let whisper_dir = get_whisper_dir(app)?;
    Ok(whisper_dir.join("ggml-tiny.bin"))
}

pub fn check_whisper_status(app: &AppHandle) -> WhisperStatus {
    let cli_path = get_whisper_cli_path(app).map(|p| p.exists() && p.is_file()).unwrap_or(false);
    let model_path = get_whisper_model_path(app).map(|p| p.exists() && p.is_file()).unwrap_or(false);
    WhisperStatus {
        binary_available: cli_path,
        model_available: model_path,
    }
}

pub async fn setup_whisper_model(app: &AppHandle) -> Result<(), String> {
    let model_path = get_whisper_model_path(app)?;
    if model_path.exists() {
        return Ok(());
    }

    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: "setup".to_string(),
        progress: 0.0,
        status: "Connecting to Hugging Face to download model (75MB)...".to_string(),
    });

    let url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";
    
    let client = reqwest::Client::builder()
        .user_agent("Vidralo-Tauri-App")
        .build()
        .map_err(|e| e.to_string())?;
        
    let response = client.get(url).send().await.map_err(|e| {
        let _ = app.emit("transcribe://progress", TranscribeProgress {
            video_id: "setup".to_string(),
            progress: 0.0,
            status: format!("Connection failed: {}", e),
        });
        e.to_string()
    })?;

    if !response.status().is_success() {
        let err_msg = format!("Failed to download model: HTTP {}", response.status());
        let _ = app.emit("transcribe://progress", TranscribeProgress {
            video_id: "setup".to_string(),
            progress: 0.0,
            status: err_msg.clone(),
        });
        return Err(err_msg);
    }
    
    let total_size = response.content_length().unwrap_or(0);
    let temp_path = model_path.with_extension("tmp");
    let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    
    let mut error_occurred = None;
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                if let Err(e) = file.write_all(&chunk) {
                    error_occurred = Some(e.to_string());
                    break;
                }
                downloaded += chunk.len() as u64;
                
                let progress = if total_size > 0 {
                    (downloaded as f64 / total_size as f64) * 100.0
                } else {
                    0.0
                };
                
                let status = if total_size > 0 {
                    format!("Downloading model... {:.1}%", progress)
                } else {
                    format!("Downloading model... {:.1} MB", downloaded as f64 / 1024.0 / 1024.0)
                };

                let _ = app.emit("transcribe://progress", TranscribeProgress {
                    video_id: "setup".to_string(),
                    progress,
                    status,
                });
            }
            Err(e) => {
                error_occurred = Some(e.to_string());
                break;
            }
        }
    }

    if let Some(e) = error_occurred {
        let _ = fs::remove_file(&temp_path);
        let _ = app.emit("transcribe://progress", TranscribeProgress {
            video_id: "setup".to_string(),
            progress: 0.0,
            status: format!("Download failed: {}", e),
        });
        return Err(e);
    }
    
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    
    fs::rename(&temp_path, &model_path).map_err(|e| e.to_string())?;
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: "setup".to_string(),
        progress: 100.0,
        status: "Model setup completed successfully!".to_string(),
    });
    
    Ok(())
}

pub async fn setup_whisper_binary(app: &AppHandle) -> Result<(), String> {
    let cli_path = get_whisper_cli_path(app)?;
    if cli_path.exists() {
        return Ok(());
    }

    let whisper_dir = get_whisper_dir(app)?;
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: "setup".to_string(),
        progress: 0.0,
        status: "Setting up whisper-cli binary...".to_string(),
    });

    #[cfg(target_os = "macos")]
    {
        // Build whisper.cpp from source zip to ensure Metal acceleration works natively
        let source_url = "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.1.tar.gz";
        let client = reqwest::Client::builder()
            .user_agent("Vidralo-Tauri-App")
            .build()
            .map_err(|e| e.to_string())?;
            
        let response = client.get(source_url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to fetch source archive: {}", response.status()));
        }
        
        let archive_path = whisper_dir.join("whisper.tar.gz");
        let mut file = File::create(&archive_path).map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        drop(file);
        
        // Extract using tar
        let status = Command::new("tar")
            .arg("-xzf")
            .arg("whisper.tar.gz")
            .current_dir(&whisper_dir)
            .status()
            .await
            .map_err(|e| format!("Failed to extract source archive: {}", e))?;
            
        if !status.success() {
            return Err("tar extraction failed".to_string());
        }
        
        let source_dir = whisper_dir.join("whisper.cpp-1.9.1");
        
        // Compile using cmake directly with static libs option
        let _ = app.emit("transcribe://progress", TranscribeProgress {
            video_id: "setup".to_string(),
            progress: 50.0,
            status: "Configuring whisper.cpp (statically linked)...".to_string(),
        });

        let cmake_status = Command::new("cmake")
            .arg("-B")
            .arg("build")
            .arg("-DBUILD_SHARED_LIBS=OFF")
            .current_dir(&source_dir)
            .status()
            .await
            .map_err(|e| format!("Failed to configure whisper.cpp with cmake: {}", e))?;

        if !cmake_status.success() {
            return Err("cmake configuration failed".to_string());
        }

        let _ = app.emit("transcribe://progress", TranscribeProgress {
            video_id: "setup".to_string(),
            progress: 75.0,
            status: "Compiling whisper.cpp natively for macOS (Metal optimized)...".to_string(),
        });

        let build_status = Command::new("cmake")
            .arg("--build")
            .arg("build")
            .arg("--config")
            .arg("Release")
            .current_dir(&source_dir)
            .status()
            .await
            .map_err(|e| format!("Failed to build whisper.cpp: {}", e))?;

        if !build_status.success() {
            return Err("cmake build failed".to_string());
        }
        
        // Copy the compiled binary
        let compiled_binary = source_dir.join("build").join("bin").join("whisper-cli");
        if compiled_binary.exists() {
            fs::copy(&compiled_binary, &cli_path).map_err(|e| e.to_string())?;
            // Set permissions
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&cli_path).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&cli_path, perms).map_err(|e| e.to_string())?;
            }
        } else {
            return Err("Compiled whisper-cli binary not found".to_string());
        }
        
        // Clean up source
        let _ = fs::remove_file(archive_path);
        let _ = fs::remove_dir_all(source_dir);
    }

    #[cfg(not(target_os = "macos"))]
    {
        // For Windows and Linux, download prebuilts
        let is_windows = cfg!(target_os = "windows");
        let download_url = if is_windows {
            "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip"
        } else {
            "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-ubuntu-x64.tar.gz"
        };
        
        let client = reqwest::Client::builder()
            .user_agent("Vidralo-Tauri-App")
            .build()
            .map_err(|e| e.to_string())?;
            
        let response = client.get(download_url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download prebuilt binary: {}", response.status()));
        }
        
        let archive_name = if is_windows { "whisper-bin.zip" } else { "whisper-bin.tar.gz" };
        let archive_path = whisper_dir.join(archive_name);
        
        let mut file = File::create(&archive_path).map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        drop(file);
        
        if is_windows {
            // Unzip file (could spawn powershell or write zip extractor, let's spawn Expand-Archive on PowerShell)
            let unzip_status = Command::new("powershell")
                .args(["-Command", &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", archive_path.to_string_lossy(), whisper_dir.to_string_lossy())])
                .status()
                .await
                .map_err(|e| format!("Failed to extract ZIP: {}", e))?;
                
            if !unzip_status.success() {
                return Err("Failed to extract whisper zip".to_string());
            }
            
            // Move main.exe to whisper-cli.exe
            let main_path = whisper_dir.join("main.exe");
            if main_path.exists() {
                fs::rename(main_path, &cli_path).map_err(|e| e.to_string())?;
            }
        } else {
            // Linux: extract using tar
            let tar_status = Command::new("tar")
                .arg("-xzf")
                .arg(archive_name)
                .current_dir(&whisper_dir)
                .status()
                .await
                .map_err(|e| format!("Failed to extract Tarball: {}", e))?;
                
            if !tar_status.success() {
                return Err("Failed to extract whisper tarball".to_string());
            }
            
            let main_path = whisper_dir.join("main");
            if main_path.exists() {
                fs::rename(main_path, &cli_path).map_err(|e| e.to_string())?;
                // Set executable permissions
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&cli_path).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&cli_path, perms).map_err(|e| e.to_string())?;
            }
        }
        
        let _ = fs::remove_file(archive_path);
    }

    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: "setup".to_string(),
        progress: 100.0,
        status: "Setup completed successfully!".to_string(),
    });
    
    Ok(())
}

pub async fn run_transcription(
    app: AppHandle,
    video_id: String,
    file_path: String,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let cli_path = get_whisper_cli_path(&app)?;
    let model_path = get_whisper_model_path(&app)?;
    
    if !cli_path.exists() || !model_path.exists() {
        return Err("Whisper tools or model not set up yet. Please set them up in Settings.".to_string());
    }
    
    let path_buf = PathBuf::from(&file_path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_wav = app_dir.join(format!("{}.wav", video_id));
    let temp_json = app_dir.join(format!("{}.wav.json", video_id));
    
    let ffmpeg_cmd = if let Some(ref path) = ffmpeg_path {
        if !path.is_empty() {
            path.clone()
        } else if let Ok(bundled_path) = crate::updater::get_ffmpeg_path(&app) {
            bundled_path.to_string_lossy().to_string()
        } else {
            "ffmpeg".to_string()
        }
    } else if let Ok(bundled_path) = crate::updater::get_ffmpeg_path(&app) {
        bundled_path.to_string_lossy().to_string()
    } else {
        "ffmpeg".to_string()
    };
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: video_id.clone(),
        progress: 10.0,
        status: "Extracting audio track...".to_string(),
    });
    
    // Convert to 16kHz mono wav
    let audio_output = Command::new(&ffmpeg_cmd)
        .args([
            "-y",
            "-i",
            &file_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            temp_wav.to_str().ok_or("Invalid temp wav path")?,
        ])
        .output()
        .await
        .map_err(|e| format!("FFmpeg execution failed: {}. Make sure FFmpeg path is set correctly.", e))?;
        
    if !audio_output.status.success() {
        let err_str = String::from_utf8_lossy(&audio_output.stderr);
        return Err(format!("FFmpeg failed: {}", err_str));
    }
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: video_id.clone(),
        progress: 40.0,
        status: "Transcribing audio (whisper.cpp)...".to_string(),
    });
    
    // Spawn whisper-cli
    let whisper_output = Command::new(&cli_path)
        .args([
            "-f",
            temp_wav.to_str().ok_or("Invalid wav path")?,
            "-m",
            model_path.to_str().ok_or("Invalid model path")?,
            "-oj", // output JSON format
        ])
        .output()
        .await
        .map_err(|e| format!("Whisper execution failed: {}", e))?;
        
    if !whisper_output.status.success() {
        let _ = fs::remove_file(&temp_wav);
        let err_str = String::from_utf8_lossy(&whisper_output.stderr);
        return Err(format!("Transcription failed: {}", err_str));
    }
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: video_id.clone(),
        progress: 80.0,
        status: "Saving transcript to database...".to_string(),
    });
    
    // Read JSON output
    if !temp_json.exists() {
        let _ = fs::remove_file(&temp_wav);
        return Err("Whisper did not produce JSON output file".to_string());
    }
    
    let json_content = fs::read_to_string(&temp_json).map_err(|e| e.to_string())?;
    
    // Parse JSON
    let parsed: WhisperJsonOutput = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse whisper output JSON: {}", e))?;
        
    // Map to db segments
    let segments: Vec<TranscriptSegment> = parsed.result.transcription.into_iter().map(|seg| {
        TranscriptSegment {
            start_ms: seg.offsets.from,
            end_ms: seg.offsets.to,
            text: seg.text,
        }
    }).collect();
    
    // Store in DB
    db::add_transcript_segments(&app_dir, &video_id, &segments)?;
    db::update_library_item_transcript_status(&app_dir, &video_id, "completed")?;
    
    // Cleanup
    let _ = fs::remove_file(&temp_wav);
    let _ = fs::remove_file(&temp_json);
    
    let _ = app.emit("transcribe://progress", TranscribeProgress {
        video_id: video_id.clone(),
        progress: 100.0,
        status: "Completed".to_string(),
    });
    
    Ok(())
}
