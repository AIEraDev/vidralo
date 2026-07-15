pub mod updater;
pub mod downloader;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use downloader::ActiveDownloads;

#[tauri::command]
async fn get_binaries_status(app: tauri::AppHandle) -> Result<updater::BinaryVersions, String> {
    Ok(updater::read_cached_versions(&app))
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<updater::UpdateCheckResult, String> {
    updater::check_updates(app).await
}

#[tauri::command]
async fn perform_updates(
    app: tauri::AppHandle,
    target_yt_version: String,
    target_bg_version: String,
) -> Result<(), String> {
    if !target_yt_version.is_empty() {
        let asset_name = updater::get_ytdlp_asset_name();
        let download_url = format!(
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
            asset_name
        );
        updater::download_binary(&app, &download_url, "yt-dlp", &target_yt_version).await?;
    }
    
    if !target_bg_version.is_empty() {
        let asset_name = updater::get_bgutil_asset_name();
        let download_url = format!(
            "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest/download/{}",
            asset_name
        );
        updater::download_binary(&app, &download_url, "bgutil-pot", &target_bg_version).await?;
    }
    
    Ok(())
}

#[tauri::command]
async fn fetch_metadata(
    app: tauri::AppHandle,
    url: String,
    cookies_browser: Option<String>,
) -> Result<downloader::VideoMetadata, String> {
    downloader::fetch_video_metadata(app, url, cookies_browser).await
}

#[tauri::command]
async fn start_download(
    app: tauri::AppHandle,
    task_id: String,
    url: String,
    format_id: String,
    output_dir: String,
    cookies_browser: Option<String>,
    filename_template: Option<String>,
) -> Result<(), String> {
    downloader::start_video_download(
        app,
        task_id,
        url,
        format_id,
        output_dir,
        cookies_browser,
        filename_template,
    ).await
}

#[tauri::command]
async fn cancel_download(app: tauri::AppHandle, task_id: String) -> Result<(), String> {
    downloader::cancel_video_download(app, task_id).await
}

#[tauri::command]
async fn verify_ffmpeg(custom_path: Option<String>) -> bool {
    let program = if let Some(ref path) = custom_path {
        if path.is_empty() { "ffmpeg" } else { path.as_str() }
    } else {
        "ffmpeg"
    };
    
    let output = tokio::process::Command::new(program)
        .arg("-version")
        .output()
        .await;
        
    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ActiveDownloads {
            processes: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            get_binaries_status,
            check_for_updates,
            perform_updates,
            fetch_metadata,
            start_download,
            cancel_download,
            verify_ffmpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

