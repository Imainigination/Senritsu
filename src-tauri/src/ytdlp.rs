use serde::Serialize;
use serde_json::Value;
use std::process::Command;

#[derive(Serialize, Clone)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub duration: f64,
    pub thumb: String,
}

/// Lists videos for a yt-dlp target (a ytsearchN: query or a playlist/mix URL).
pub fn list(target: &str, limit: usize) -> Result<Vec<Track>, String> {
    let lim = limit.to_string();
    let out = Command::new("yt-dlp")
        .args([
            "--flat-playlist",
            "--dump-single-json",
            "--no-warnings",
            "--ignore-errors",
            "--playlist-end",
            lim.as_str(),
            "--",
            target,
        ])
        .output()
        .map_err(|e| format!("Could not run yt-dlp (is it installed?): {e}"))?;

    if out.stdout.is_empty() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() { "yt-dlp returned nothing".into() } else { err });
    }

    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
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
