use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

#[derive(Serialize, Clone)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub duration: f64,
    pub thumb: String,
}

/// A resolved direct audio stream, cached so playback can start instantly.
#[derive(Clone)]
pub struct Stream {
    pub url: String,
    pub ua: Option<String>,
    at: Instant,
}

static CACHE: OnceLock<Mutex<HashMap<String, Stream>>> = OnceLock::new();
const TTL: Duration = Duration::from_secs(3 * 3600);

fn cache() -> &'static Mutex<HashMap<String, Stream>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn cached(id: &str) -> Option<Stream> {
    let mut c = cache().lock().unwrap();
    let fresh = c.get(id).map(|s| s.at.elapsed() < TTL);
    match fresh {
        Some(true) => c.get(id).cloned(),
        Some(false) => {
            c.remove(id);
            None
        }
        None => None,
    }
}

pub fn forget(id: &str) {
    cache().lock().unwrap().remove(id);
}

fn run(args: &[&str]) -> Result<Vec<u8>, String> {
    let out = Command::new("yt-dlp")
        .args(args)
        .output()
        .map_err(|e| format!("Could not run yt-dlp (is it installed?): {e}"))?;
    if out.stdout.is_empty() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "yt-dlp returned nothing".into()
        } else {
            err
        });
    }
    Ok(out.stdout)
}

/// Lists videos for a yt-dlp target (a ytsearchN: query or a playlist/mix URL).
pub fn list(target: &str, limit: usize) -> Result<Vec<Track>, String> {
    let lim = limit.to_string();
    let stdout = run(&[
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        "--ignore-errors",
        "--playlist-end",
        lim.as_str(),
        "--",
        target,
    ])?;

    let v: Value = serde_json::from_slice(&stdout).map_err(|e| e.to_string())?;
    let mut tracks = Vec::new();
    if let Some(entries) = v["entries"].as_array() {
        for e in entries {
            let id = e["id"].as_str().unwrap_or("");
            if id.len() != 11 {
                continue;
            }
            let artist = e["channel"]
                .as_str()
                .or_else(|| e["uploader"].as_str())
                .unwrap_or("Unknown")
                .trim_end_matches(" - Topic")
                .to_string();
            tracks.push(Track {
                id: id.to_string(),
                title: e["title"].as_str().unwrap_or("Untitled").to_string(),
                artist,
                duration: e["duration"].as_f64().unwrap_or(0.0),
                thumb: format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"),
            });
        }
    }
    Ok(tracks)
}

/// Resolves the best audio stream of a video and caches it.
pub fn resolve_audio(id: &str) -> Result<Stream, String> {
    let page = format!("https://www.youtube.com/watch?v={id}");
    let stdout = run(&[
        "-j",
        "-f",
        "bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--",
        page.as_str(),
    ])?;
    let v: Value = serde_json::from_slice(&stdout).map_err(|e| e.to_string())?;
    let url = v["url"].as_str().ok_or("yt-dlp gave no stream url")?.to_string();
    let ua = v["http_headers"]["User-Agent"].as_str().map(String::from);
    let s = Stream {
        url,
        ua,
        at: Instant::now(),
    };
    cache().lock().unwrap().insert(id.to_string(), s.clone());
    Ok(s)
}

/// Resolves a video-only stream (for the in-app <video> element).
/// `codecs` are vcodec prefixes the webview can decode, e.g. ["vp09", "avc1"].
pub fn resolve_video(id: &str, height: u32, codecs: &[String]) -> Result<String, String> {
    let h = height.clamp(144, 2160);
    let fmt = codecs
        .iter()
        .filter(|c| !c.is_empty() && c.chars().all(|ch| ch.is_ascii_alphanumeric()))
        .map(|c| format!("bv[height<=?{h}][vcodec^={c}]"))
        .collect::<Vec<_>>()
        .join("/");
    if fmt.is_empty() {
        return Err("no supported video codec".into());
    }
    let page = format!("https://www.youtube.com/watch?v={id}");
    let stdout = run(&[
        "-g",
        "-f",
        fmt.as_str(),
        "--no-playlist",
        "--no-warnings",
        "--",
        page.as_str(),
    ])?;
    String::from_utf8_lossy(&stdout)
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .ok_or_else(|| "no video stream found".to_string())
}
