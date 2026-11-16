//! Zaycev.net as a fast fallback source (plain HTTP, direct MP3). Search results are
//! matched strictly: when nothing matches, Zaycev returns its global chart instead.

use reqwest::Client;
use serde_json::Value;

const API: &str = "https://zaycev.net/api/external";
const REFERER: &str = "https://zaycev.net/";
const MAX_DURATION_DIFF_SECS: f64 = 8.0;

/// Lowercase, ё→е, keep only letters/digits separated by single spaces.
pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut space = true;
    for ch in s.to_lowercase().chars() {
        let ch = if ch == 'ё' { 'е' } else { ch };
        if ch.is_alphanumeric() {
            out.push(ch);
            space = false;
        } else if !space {
            out.push(' ');
            space = true;
        }
    }
    out.trim_end().to_string()
}

/// Drop "(feat. …)", "[prod …]" and similar decorations before comparing titles.
fn core_title(title: &str) -> String {
    let mut s = String::new();
    let mut depth = 0;
    for ch in title.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth == 0 => s.push(ch),
            _ => {}
        }
    }
    let n = normalize(&s);
    n.split(" feat ").next().unwrap_or(&n).trim().to_string()
}

fn parse_duration(v: &Value) -> Option<f64> {
    if let Some(n) = v.as_f64() {
        return Some(n);
    }
    let s = v.as_str()?;
    let mut secs = 0.0;
    for part in s.split(':') {
        secs = secs * 60.0 + part.trim().parse::<f64>().ok()?;
    }
    Some(secs)
}

/// Same song? Title must match (one contains the other), some artist word must overlap,
/// and the lengths must be close when both are known.
pub fn is_match(
    want_artist: &str,
    want_title: &str,
    want_secs: Option<f64>,
    got_artist: &str,
    got_title: &str,
    got_secs: Option<f64>,
) -> bool {
    let (wt, gt) = (core_title(want_title), core_title(got_title));
    if wt.is_empty() || gt.is_empty() || !(wt == gt || wt.contains(&gt) || gt.contains(&wt)) {
        return false;
    }
    let ga = normalize(got_artist);
    let artist_ok = normalize(want_artist)
        .split(' ')
        .filter(|w| w.chars().count() >= 3)
        .any(|w| ga.split(' ').any(|g| g == w));
    if !artist_ok {
        return false;
    }
    match (want_secs, got_secs) {
        (Some(a), Some(b)) => (a - b).abs() <= MAX_DURATION_DIFF_SECS,
        _ => true,
    }
}

async fn get_json(client: &Client, req: reqwest::RequestBuilder) -> Result<Value, String> {
    let _ = client;
    req.header("Accept", "application/json")
        .header("Referer", REFERER)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("zaycev: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| format!("zaycev json: {e}"))
}

/// Returns a direct MP3 URL for the best matching Zaycev track.
pub async fn find_audio_url(
    client: &Client,
    artist: &str,
    title: &str,
    duration_secs: Option<f64>,
) -> Result<String, String> {
    let query = format!("{artist} {}", core_title(title));
    let found = get_json(
        client,
        client.get(format!("{API}/pages/search/tracks")).query(&[
            ("q", query.as_str()),
            ("page", "1"),
            ("limit", "10"),
        ]),
    )
    .await?;
    let info = found.get("tracksInfo").cloned().unwrap_or(Value::Null);
    let ids = found
        .get("trackIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let id = ids
        .iter()
        .filter_map(|id| {
            let key = id
                .as_u64()
                .map(|n| n.to_string())
                .or_else(|| id.as_str().map(str::to_string))?;
            let t = info.get(&key)?;
            if t.get("playbackEnabled") == Some(&Value::Bool(false)) {
                return None;
            }
            let got_artist = t.get("artistName").and_then(Value::as_str).unwrap_or("");
            let got_title = t.get("track").and_then(Value::as_str).unwrap_or("");
            let got_secs = t.get("duration").and_then(parse_duration);
            is_match(
                artist,
                title,
                duration_secs,
                got_artist,
                got_title,
                got_secs,
            )
            .then_some(key)
        })
        .next()
        .ok_or_else(|| "no matching Zaycev track".to_string())?;

    let meta = get_json(
        client,
        client
            .post(format!("{API}/track/filezmeta"))
            .json(&serde_json::json!({ "trackIds": [id.parse::<u64>().unwrap_or(0)], "subscription": false })),
    )
    .await?;
    let hash = meta
        .pointer("/tracks/0/streaming")
        .and_then(Value::as_str)
        .ok_or_else(|| "zaycev: track not streamable".to_string())?;
    let play = get_json(client, client.get(format!("{API}/track/play/{hash}"))).await?;
    play.get("url")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "zaycev: no play url".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_same_song_and_rejects_chart_noise() {
        assert!(is_match(
            "SEREBRO",
            "Я тебя не отдам",
            Some(200.0),
            "Serebro",
            "Я тебя не отдам",
            Some(203.0)
        ));
        assert!(is_match(
            "Big Baby Tape",
            "Gimme The Loot (prod. X)",
            None,
            "Big Baby Tape, kizaru",
            "Gimme the Loot",
            None
        ));
        // Zaycev returns its chart when nothing matches — must be rejected.
        assert!(!is_match(
            "SEREBRO",
            "Я тебя не отдам",
            Some(200.0),
            "Johnyboy",
            "Hoodie",
            Some(144.0)
        ));
        // Same title, different artist.
        assert!(!is_match(
            "Дельфин",
            "Серебро",
            None,
            "Одиссей",
            "Серебро",
            None
        ));
        // Same song but a very different length (e.g. extended mix).
        assert!(!is_match(
            "A",
            "Song",
            Some(180.0),
            "A",
            "Song",
            Some(400.0)
        ));
        assert_eq!(normalize("Ёлка — Новый Год!"), "елка новый год");
    }
}
