use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::Write;
use tauri::{AppHandle, Manager, Emitter};
use tauri::path::BaseDirectory;
use serde::{Serialize, Deserialize};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BinaryVersions {
    pub yt_dlp: String,
    pub bgutil_pot: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateCheckResult {
    pub yt_dlp_current: String,
    pub yt_dlp_latest: String,
    pub yt_dlp_update_available: bool,
    pub bgutil_current: String,
    pub bgutil_latest: String,
    pub bgutil_update_available: bool,
}

#[derive(Serialize, Clone)]
pub struct UpdateProgressPayload {
    pub binary: String,
    pub progress: f64, // 0.0 to 100.0
    pub status: String,
}

pub fn get_target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "aarch64-apple-darwin" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "x86_64-apple-darwin" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "x86_64-pc-windows-msvc" }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    { "aarch64-pc-windows-msvc" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "x86_64-unknown-linux-gnu" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "aarch64-unknown-linux-gnu" }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    { "unknown" }
}

pub fn get_binary_extension() -> &'static str {
    if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    }
}

pub fn get_ytdlp_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp_linux"
    }
}

pub fn get_bgutil_asset_name() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "bgutil-pot-macos-aarch64" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "bgutil-pot-macos-x86_64" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "bgutil-pot-windows-x86_64.exe" }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    { "bgutil-pot-windows-aarch64.exe" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "bgutil-pot-linux-x86_64" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "bgutil-pot-linux-aarch64" }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    { "unknown" }
}


// Helper to check version by running standard command with --version
fn get_local_binary_version(path: &Path) -> Option<String> {
    if !path.exists() || !path.is_file() {
        return None;
    }
    
    let output = std::process::Command::new(path)
        .arg("--version")
        .output()
        .ok()?;
        
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // If it starts with bgutil-pot, parse it out, e.g. "bgutil-pot 0.8.1"
        if version_str.starts_with("bgutil-pot ") {
            return Some(version_str.replace("bgutil-pot ", ""));
        }
        Some(version_str)
    } else {
        None
    }
}

// Get paths of either the updated binary or the bundled sidecar
pub fn get_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("yt-dlp{}", get_binary_extension()));
    
    if updated_path.exists() && updated_path.is_file() {
        return Ok(updated_path);
    }
    
    let sidecar_filename = format!("binaries/yt-dlp-{}{}", get_target_triple(), get_binary_extension());
    let bundled_path = app.path().resolve(&sidecar_filename, BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
        
    if bundled_path.exists() && bundled_path.is_file() {
        Ok(bundled_path)
    } else {
        Err(format!("yt-dlp sidecar not found at {:?}", bundled_path))
    }
}

pub fn get_bgutil_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("bgutil-pot{}", get_binary_extension()));
    
    if updated_path.exists() && updated_path.is_file() {
        return Ok(updated_path);
    }
    
    let sidecar_filename = format!("binaries/bgutil-pot-{}{}", get_target_triple(), get_binary_extension());
    let bundled_path = app.path().resolve(&sidecar_filename, BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
        
    if bundled_path.exists() && bundled_path.is_file() {
        Ok(bundled_path)
    } else {
        Err(format!("bgutil-pot sidecar not found at {:?}", bundled_path))
    }
}

pub fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let updated_path = app_dir.join("binaries").join(format!("ffmpeg{}", get_binary_extension()));
    
    if updated_path.exists() && updated_path.is_file() {
        return Ok(updated_path);
    }
    
    let sidecar_filename = format!("binaries/ffmpeg-{}{}", get_target_triple(), get_binary_extension());
    let bundled_path = app.path().resolve(&sidecar_filename, BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
        
    if bundled_path.exists() && bundled_path.is_file() {
        Ok(bundled_path)
    } else {
        Err(format!("ffmpeg sidecar not found at {:?}", bundled_path))
    }
}

pub fn get_versions_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("versions.json"))
}

pub fn read_cached_versions(app: &AppHandle) -> BinaryVersions {
    if let Ok(versions_file) = get_versions_file_path(app) {
        if versions_file.exists() {
            if let Ok(data) = fs::read_to_string(&versions_file) {
                if let Ok(versions) = serde_json::from_str::<BinaryVersions>(&data) {
                    return versions;
                }
            }
        }
    }
    
    // Calculate fallback versions by executing binaries directly
    let yt_version = get_ytdlp_path(app)
        .ok()
        .and_then(|p| get_local_binary_version(&p))
        .unwrap_or_else(|| "0.0.0".to_string());
        
    let bg_version = get_bgutil_path(app)
        .ok()
        .and_then(|p| get_local_binary_version(&p))
        .unwrap_or_else(|| "0.0.0".to_string());
        
    BinaryVersions {
        yt_dlp: yt_version,
        bgutil_pot: bg_version,
    }
}

pub fn write_cached_versions(app: &AppHandle, versions: &BinaryVersions) -> Result<(), String> {
    let versions_file = get_versions_file_path(app)?;
    if let Some(parent) = versions_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(versions).map_err(|e| e.to_string())?;
    fs::write(versions_file, data).map_err(|e| e.to_string())?;
    Ok(())
}

// GitHub Releases API struct
#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

pub async fn check_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = read_cached_versions(&app);
    
    let client = reqwest::Client::builder()
        .user_agent("Vidralo-Tauri-App")
        .build()
        .map_err(|e| e.to_string())?;
        
    // Check yt-dlp latest
    let yt_latest_res = client.get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let yt_latest_tag = if yt_latest_res.status().is_success() {
        let release = yt_latest_res.json::<GitHubRelease>().await.map_err(|e| e.to_string())?;
        release.tag_name
    } else {
        current.yt_dlp.clone()
    };
    
    // Check bgutil-pot latest
    let bg_latest_res = client.get("https://api.github.com/repos/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let bg_latest_tag = if bg_latest_res.status().is_success() {
        let release = bg_latest_res.json::<GitHubRelease>().await.map_err(|e| e.to_string())?;
        // Tag names are often like "v0.8.1", remove "v" to compare
        release.tag_name
    } else {
        current.bgutil_pot.clone()
    };
    
    let clean_bg_current = current.bgutil_pot.trim_start_matches('v').to_string();
    let clean_bg_latest = bg_latest_tag.trim_start_matches('v').to_string();
    
    let yt_update = current.yt_dlp != yt_latest_tag;
    let bg_update = clean_bg_current != clean_bg_latest;
    
    Ok(UpdateCheckResult {
        yt_dlp_current: current.yt_dlp,
        yt_dlp_latest: yt_latest_tag,
        yt_dlp_update_available: yt_update,
        bgutil_current: current.bgutil_pot,
        bgutil_latest: bg_latest_tag,
        bgutil_update_available: bg_update,
    })
}

pub async fn download_binary(
    app: &AppHandle,
    url: &str,
    binary_name: &str,
    target_version: &str,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let binaries_dir = app_dir.join("binaries");
    fs::create_dir_all(&binaries_dir).map_err(|e| e.to_string())?;
    
    let dest_filename = format!("{}{}", binary_name, get_binary_extension());
    let dest_path = binaries_dir.join(&dest_filename);
    let temp_path = binaries_dir.join(format!("{}.tmp", dest_filename));
    
    let client = reqwest::Client::builder()
        .user_agent("Vidralo-Tauri-App")
        .build()
        .map_err(|e| e.to_string())?;
        
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download {}: HTTP {}", binary_name, response.status()));
    }
    
    let total_size = response.content_length().unwrap_or(0);
    let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = app.emit("update://progress", UpdateProgressPayload {
                binary: binary_name.to_string(),
                progress,
                status: format!("Downloading {}... {:.1}%", binary_name, progress),
            });
        }
    }
    
    // Explicitly flush and drop file before renaming/replacing
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    
    // Set permissions on unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&temp_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&temp_path, perms).map_err(|e| e.to_string())?;
    }
    
    // Replace old binary
    if dest_path.exists() {
        fs::remove_file(&dest_path).map_err(|e| e.to_string())?;
    }
    fs::rename(&temp_path, &dest_path).map_err(|e| e.to_string())?;
    
    // Update cached versions file
    let mut current_versions = read_cached_versions(app);
    if binary_name == "yt-dlp" {
        current_versions.yt_dlp = target_version.to_string();
    } else if binary_name == "bgutil-pot" {
        current_versions.bgutil_pot = target_version.to_string();
    }
    write_cached_versions(app, &current_versions)?;
    
    let _ = app.emit("update://progress", UpdateProgressPayload {
        binary: binary_name.to_string(),
        progress: 100.0,
        status: format!("{} updated successfully!", binary_name),
    });
    
    Ok(())
}
