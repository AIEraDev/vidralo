use std::path::{Path, PathBuf};
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LibraryItem {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub thumbnail: String,
    pub url: String,
    pub file_path: Option<String>,
    pub status: String,
    pub added_at: String,
    pub format: String,
    pub transcript_status: String, // 'none', 'queued', 'transcribing', 'completed', 'failed'
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TranscriptSegment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Subscription {
    pub url: String,
    pub title: String,
    pub type_info: String, // 'channel' or 'playlist'
    pub archive_path: String,
    pub added_at: String,
    pub last_checked: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub video_id: String,
    pub title: String,
    pub uploader: String,
    pub thumbnail: String,
    pub file_path: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

pub fn get_db_path(app_dir: &Path) -> PathBuf {
    app_dir.join("vidralo.db")
}

pub fn get_db_conn(app_dir: &Path) -> SqliteResult<Connection> {
    let path = get_db_path(app_dir);
    Connection::open(path)
}

pub fn init_db(app_dir: &Path) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    
    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", []).map_err(|e| e.to_string())?;

    // Create library table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS library (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            uploader TEXT NOT NULL,
            duration REAL NOT NULL,
            thumbnail TEXT NOT NULL,
            url TEXT NOT NULL,
            file_path TEXT,
            status TEXT NOT NULL,
            added_at TEXT NOT NULL,
            format TEXT NOT NULL,
            transcript_status TEXT DEFAULT 'none'
        );",
        [],
    ).map_err(|e| e.to_string())?;

    // Create transcript segments table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcript_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY(video_id) REFERENCES library(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| e.to_string())?;

    // Create FTS5 virtual table
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
            video_id UNINDEXED,
            segment_id UNINDEXED,
            title,
            uploader,
            text
        );",
        [],
    ).map_err(|e| e.to_string())?;

    // Create subscriptions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS subscriptions (
            url TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type_info TEXT NOT NULL,
            archive_path TEXT NOT NULL,
            added_at TEXT NOT NULL,
            last_checked TEXT
        );",
        [],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn add_library_item(app_dir: &Path, item: &LibraryItem) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO library (id, title, uploader, duration, thumbnail, url, file_path, status, added_at, format, transcript_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);",
        params![
            item.id,
            item.title,
            item.uploader,
            item.duration,
            item.thumbnail,
            item.url,
            item.file_path,
            item.status,
            item.added_at,
            item.format,
            item.transcript_status,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_library_item_status(app_dir: &Path, id: &str, status: &str, file_path: Option<&str>) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE library SET status = ?1, file_path = COALESCE(?2, file_path) WHERE id = ?3;",
        params![status, file_path, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_library_item_transcript_status(app_dir: &Path, id: &str, status: &str) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE library SET transcript_status = ?1 WHERE id = ?2;",
        params![status, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_library_items(app_dir: &Path) -> Result<Vec<LibraryItem>, String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, title, uploader, duration, thumbnail, url, file_path, status, added_at, format, transcript_status FROM library ORDER BY added_at DESC;"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(LibraryItem {
            id: row.get(0)?,
            title: row.get(1)?,
            uploader: row.get(2)?,
            duration: row.get(3)?,
            thumbnail: row.get(4)?,
            url: row.get(5)?,
            file_path: row.get(6)?,
            status: row.get(7)?,
            added_at: row.get(8)?,
            format: row.get(9)?,
            transcript_status: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            items.push(item);
        }
    }
    Ok(items)
}

pub fn delete_library_item(app_dir: &Path, id: &str) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM library WHERE id = ?1;", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM library_fts WHERE video_id = ?1;", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_transcript_segments(app_dir: &Path, video_id: &str, segments: &[TranscriptSegment]) -> Result<(), String> {
    let mut conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    
    // Retrieve title and uploader to store in FTS index
    let (title, uploader): (String, String) = conn.query_row(
        "SELECT title, uploader FROM library WHERE id = ?1;",
        params![video_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Failed to find library video metadata: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Clear existing segments and FTS index for this video to prevent duplicates
    tx.execute("DELETE FROM transcript_segments WHERE video_id = ?1;", params![video_id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM library_fts WHERE video_id = ?1;", params![video_id]).map_err(|e| e.to_string())?;

    {
        let mut ins_stmt = tx.prepare(
            "INSERT INTO transcript_segments (video_id, start_ms, end_ms, text) VALUES (?1, ?2, ?3, ?4);"
        ).map_err(|e| e.to_string())?;
        
        let mut fts_stmt = tx.prepare(
            "INSERT INTO library_fts (video_id, segment_id, title, uploader, text) VALUES (?1, ?2, ?3, ?4, ?5);"
        ).map_err(|e| e.to_string())?;

        for seg in segments {
            let row_id = ins_stmt.insert(params![
                video_id,
                seg.start_ms,
                seg.end_ms,
                seg.text.trim(),
            ]).map_err(|e| e.to_string())?;
            
            fts_stmt.execute(params![
                video_id,
                row_id,
                &title,
                &uploader,
                seg.text.trim(),
            ]).map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn search_library(app_dir: &Path, search_query: &str) -> Result<Vec<SearchResult>, String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    
    // Perform search using FTS5 MATCH
    let mut stmt = conn.prepare(
        "SELECT f.video_id, f.title, f.uploader, s.start_ms, s.end_ms, s.text, l.thumbnail, l.file_path
         FROM library_fts f
         JOIN transcript_segments s ON f.segment_id = s.id
         JOIN library l ON f.video_id = l.id
         WHERE library_fts MATCH ?1
         ORDER BY rank
         LIMIT 100;"
    ).map_err(|e| e.to_string())?;

    let search_pattern = format!("\"{}\"", search_query.replace('"', ""));

    let rows = stmt.query_map(params![search_pattern], |row| {
        Ok(SearchResult {
            video_id: row.get(0)?,
            title: row.get(1)?,
            uploader: row.get(2)?,
            start_ms: row.get(3)?,
            end_ms: row.get(4)?,
            text: row.get(5)?,
            thumbnail: row.get(6)?,
            file_path: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        if let Ok(res) = row {
            results.push(res);
        }
    }
    Ok(results)
}

pub fn add_subscription(app_dir: &Path, sub: &Subscription) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO subscriptions (url, title, type_info, archive_path, added_at, last_checked)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
        params![
            sub.url,
            sub.title,
            sub.type_info,
            sub.archive_path,
            sub.added_at,
            sub.last_checked,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_subscriptions(app_dir: &Path) -> Result<Vec<Subscription>, String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT url, title, type_info, archive_path, added_at, last_checked FROM subscriptions ORDER BY added_at DESC;"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(Subscription {
            url: row.get(0)?,
            title: row.get(1)?,
            type_info: row.get(2)?,
            archive_path: row.get(3)?,
            added_at: row.get(4)?,
            last_checked: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut subs = Vec::new();
    for row in rows {
        if let Ok(sub) = row {
            subs.push(sub);
        }
    }
    Ok(subs)
}

pub fn delete_subscription(app_dir: &Path, url: &str) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM subscriptions WHERE url = ?1;", params![url]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_subscription_last_checked(app_dir: &Path, url: &str, time: &str) -> Result<(), String> {
    let conn = get_db_conn(app_dir).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE subscriptions SET last_checked = ?1 WHERE url = ?2;",
        params![time, url],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
