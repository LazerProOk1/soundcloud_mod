//! Fallback source for tracks SoundCloud won't serve (DRM / removed / region-locked):
//! find the same song on YouTube with yt-dlp and return a direct audio URL.
//! The track keeps its SoundCloud URN, so likes, playlists and the cache keep working.

use std::path::{Path, PathBuf};
use std::time::Duration;

use reqwest::Client;
use tokio::process::Command;
use tokio::sync::Mutex;

const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const RUN_TIMEOUT: Duration = Duration::from_secs(40);
/// Accept a YouTube result only if its length is this close to the SoundCloud track.
const MAX_DURATION_DIFF_SECS: f64 = 15.0;

static INSTALL_LOCK: Mutex<()> = Mutex::const_new(());

fn bin_path(dir: &Path) -> PathBuf {
    dir.join(if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    })
}

/// Downloads yt-dlp once into `dir` (≈15 MB). Linux/macOS use a system yt-dlp from PATH.
pub async fn ensure_ytdlp(dir: &Path, client: &Client) -> Result<PathBuf, String> {
    if !cfg!(windows) {
        return Ok(PathBuf::from("yt-dlp"));
    }
    let bin = bin_path(dir);
    if bin.exists() {
        return Ok(bin);
    }
    let _guard = INSTALL_LOCK.lock().await;
    if bin.exists() {
        return Ok(bin);
    }
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("yt-dlp dir: {e}"))?;
    let resp = client
        .get(YTDLP_URL)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("yt-dlp download: {e}"))?;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("yt-dlp download: {e}"))?;
    let tmp = dir.join("yt-dlp.exe.part");
    tokio::fs::write(&tmp, &bytes)
        .await
        .map_err(|e| format!("yt-dlp write: {e}"))?;
    tokio::fs::rename(&tmp, &bin)
        .await
        .map_err(|e| format!("yt-dlp install: {e}"))?;
    println!("[YouTube] installed yt-dlp ({} KB)", bytes.len() / 1024);
    Ok(bin)
}

async fn run(bin: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new(bin);
    cmd.args(args).kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = tokio::time::timeout(RUN_TIMEOUT, cmd.output())
        .await
        .map_err(|_| "yt-dlp timed out".to_string())?
        .map_err(|e| format!("yt-dlp start: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let line = err
            .lines()
            .rev()
            .find(|l| l.contains("ERROR"))
            .unwrap_or("failed");
        return Err(format!("yt-dlp: {}", line.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

const UNWANTED: [&str; 9] = [
    "cover",
    "karaoke",
    "nightcore",
    "sped up",
    "speed up",
    "slowed",
    "remix",
    "8d",
    "instrumental",
];

/// Pick the search result whose length matches best, skipping covers/remixes
/// unless the query itself asks for them. Lines: `id\tduration\ttitle`.
pub fn pick_best(listing: &str, query: &str, duration_secs: Option<f64>) -> Option<String> {
    let q = query.to_lowercase();
    let mut best: Option<(f64, String)> = None;
    for line in listing.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(id), Some(dur), title) = (parts.next(), parts.next(), parts.next().unwrap_or(""))
        else {
            continue;
        };
        if id.is_empty() {
            continue;
        }
        let t = title.to_lowercase();
        if UNWANTED.iter().any(|w| t.contains(w) && !q.contains(w)) {
            continue;
        }
        let score = match (duration_secs, dur.parse::<f64>().ok()) {
            (Some(want), Some(got)) => {
                let diff = (want - got).abs();
                if diff > MAX_DURATION_DIFF_SECS {
                    continue;
                }
                diff
            }
            // Unknown length on either side: keep search order.
            _ => 100.0 + best.as_ref().map_or(0.0, |_| 1.0),
        };
        if best.as_ref().is_none_or(|(s, _)| score < *s) {
            best = Some((score, id.to_string()));
        }
    }
    best.map(|(_, id)| id)
}

/// Returns a direct audio URL (AAC/M4A preferred — our decoder handles it).
pub async fn find_audio_url(
    bin: &Path,
    query: &str,
    duration_secs: Option<f64>,
) -> Result<String, String> {
    let search = format!("ytsearch6:{query}");
    let listing = run(
        bin,
        &[
            "--flat-playlist",
            "--no-warnings",
            "--print",
            "%(id)s\t%(duration)s\t%(title)s",
            &search,
        ],
    )
    .await?;
    let id = pick_best(&listing, query, duration_secs)
        .ok_or_else(|| "no matching YouTube result".to_string())?;
    let url = format!("https://www.youtube.com/watch?v={id}");
    let out = run(
        bin,
        &[
            "--no-warnings",
            "--no-playlist",
            "-f",
            "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio",
            "-g",
            &url,
        ],
    )
    .await?;
    out.lines()
        .find(|l| l.starts_with("http"))
        .map(str::to_string)
        .ok_or_else(|| "yt-dlp returned no audio URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::pick_best;

    #[test]
    fn picks_closest_duration_and_skips_covers() {
        let listing = "a\t200\tSong (Cover)\nb\t240\tArtist - Song\nc\t203\tArtist - Song (Official)\nd\t500\tSong 1 hour";
        assert_eq!(
            pick_best(listing, "Artist Song", Some(201.0)).as_deref(),
            Some("c")
        );
        assert_eq!(
            pick_best(listing, "Artist Song cover", Some(200.0)).as_deref(),
            Some("a")
        );
        assert_eq!(pick_best(listing, "Artist Song", Some(900.0)), None);
        assert_eq!(
            pick_best(listing, "Artist Song", None).as_deref(),
            Some("b")
        );
    }
}
