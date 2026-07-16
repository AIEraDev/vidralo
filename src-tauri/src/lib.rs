pub mod updater;
pub mod downloader;
pub mod db;
pub mod transcribe;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::fs;
use tauri::{Manager, Emitter};
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
async fn fetch_playlist_metadata(
    app: tauri::AppHandle,
    url: String,
    cookies_browser: Option<String>,
) -> Result<downloader::PlaylistMetadata, String> {
    downloader::fetch_playlist_metadata(app, url, cookies_browser).await
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
    downloader::start_video_download(
        app,
        task_id,
        url,
        format_id,
        output_dir,
        cookies_browser,
        filename_template,
        limit_rate,
        trim_range,
        sponsorblock_categories,
        sub_langs,
        write_subs,
        write_auto_subs,
        embed_subs,
        embed_metadata,
        transcribe,
        ffmpeg_path,
        title,
        uploader,
        duration,
        thumbnail,
    ).await
}

#[tauri::command]
async fn cancel_download(app: tauri::AppHandle, task_id: String) -> Result<(), String> {
    downloader::cancel_video_download(app, task_id).await
}

#[tauri::command]
async fn verify_ffmpeg(app: tauri::AppHandle, custom_path: Option<String>) -> bool {
    // 1. Try custom path if provided
    if let Some(ref path) = custom_path {
        if !path.is_empty() {
            let output = tokio::process::Command::new(path)
                .arg("-version")
                .output()
                .await;
            if let Ok(out) = output {
                if out.status.success() {
                    return true;
                }
            }
        }
    }
    
    // 2. Try bundled/downloaded sidecar ffmpeg
    if let Ok(bundled_path) = updater::get_ffmpeg_path(&app) {
        let output = tokio::process::Command::new(bundled_path)
            .arg("-version")
            .output()
            .await;
        if let Ok(out) = output {
            if out.status.success() {
                return true;
            }
        }
    }
    
    // 3. Fallback to system PATH "ffmpeg"
    let output = tokio::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .await;
        
    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
async fn get_whisper_status(app: tauri::AppHandle) -> Result<transcribe::WhisperStatus, String> {
    Ok(transcribe::check_whisper_status(&app))
}

#[tauri::command]
async fn setup_whisper_model(app: tauri::AppHandle) -> Result<(), String> {
    transcribe::setup_whisper_model(&app).await
}

#[tauri::command]
async fn setup_whisper_binary(app: tauri::AppHandle) -> Result<(), String> {
    transcribe::setup_whisper_binary(&app).await
}

#[tauri::command]
async fn transcribe_video(
    app: tauri::AppHandle,
    video_id: String,
    file_path: String,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    transcribe::run_transcription(app, video_id, file_path, ffmpeg_path).await
}

#[tauri::command]
async fn get_library_items(app: tauri::AppHandle) -> Result<Vec<db::LibraryItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::get_library_items(&app_dir)
}

#[tauri::command]
async fn add_library_item(app: tauri::AppHandle, item: db::LibraryItem) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::add_library_item(&app_dir, &item)
}

#[tauri::command]
async fn delete_library_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::delete_library_item(&app_dir, &id)
}

#[tauri::command]
async fn search_library(app: tauri::AppHandle, query: String) -> Result<Vec<db::SearchResult>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::search_library(&app_dir, &query)
}

#[tauri::command]
async fn get_subscriptions(app: tauri::AppHandle) -> Result<Vec<db::Subscription>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::get_subscriptions(&app_dir)
}

#[tauri::command]
async fn add_subscription(app: tauri::AppHandle, sub: db::Subscription) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::add_subscription(&app_dir, &sub)
}

#[tauri::command]
async fn delete_subscription(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::delete_subscription(&app_dir, &url)
}

#[tauri::command]
async fn update_subscription_last_checked(app: tauri::AppHandle, url: String, time: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::update_subscription_last_checked(&app_dir, &url, &time)
}

#[tauri::command]
async fn install_plugin(app: tauri::AppHandle, plugin_id: String) -> Result<(), String> {
    if plugin_id != "ChromeCookieUnlock" {
        return Err("Plugin not in allowlist".to_string());
    }
    
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let plugins_dir = if cfg!(target_os = "windows") {
        home.join("AppData").join("Roaming").join("yt-dlp").join("plugins")
    } else {
        home.join(".config").join("yt-dlp").join("plugins")
    };
    
    fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    let dest_path = plugins_dir.join("chrome_cookie_unlock.py");
    
    let url = "https://raw.githubusercontent.com/marnix/yt-dlp-chrome-cookie-unlock/main/yt_dlp_plugins/postprocessor/chrome_cookie_unlock.py";
    
    let client = reqwest::Client::builder()
        .user_agent("Vidralo-Tauri-App")
        .build()
        .map_err(|e| e.to_string())?;
        
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Failed to download plugin: HTTP {}", response.status()));
    }
    
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
            let _ = app.emit("single-instance", args);
        }))
        .manage(ActiveDownloads {
            processes: Arc::new(Mutex::new(HashMap::new())),
        })
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            if !app_dir.exists() {
                fs::create_dir_all(&app_dir)?;
            }
            db::init_db(&app_dir).map_err(|e| e.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_binaries_status,
            check_for_updates,
            perform_updates,
            fetch_metadata,
            fetch_playlist_metadata,
            start_download,
            cancel_download,
            verify_ffmpeg,
            get_whisper_status,
            setup_whisper_model,
            setup_whisper_binary,
            transcribe_video,
            get_library_items,
            add_library_item,
            delete_library_item,
            search_library,
            get_subscriptions,
            add_subscription,
            delete_subscription,
            update_subscription_last_checked,
            install_plugin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
