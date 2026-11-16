//! Audius as a fallback source: open API, search + direct MP3 stream redirect.
//! Matching reuses the strict Zaycev matcher (title, artist word, length).

use reqwest::Client;
use serde_json::Value;

use super::zaycev::is_match;

const API: &str = "https://api.audius.co/v1";
const APP_NAME: &str = "soundcloud_mod";

/// Returns a stream URL (redirects to the MP3) for the best matching Audius track.
pub async fn find_audio_url(
    client: &Client,
    artist: &str,
    title: &str,
    duration_secs: Option<f64>,
) -> Result<String, String> {
    let query = format!("{artist} {title}");
    let found: Value = client
        .get(format!("{API}/tracks/search"))
        .query(&[("query", query.trim()), ("app_name", APP_NAME)])
        .header("Accept", "application/json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("audius: {e}"))?
        .json()
        .await
        .map_err(|e| format!("audius json: {e}"))?;

    let id = found
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|t| t.get("is_streamable").and_then(Value::as_bool) != Some(false))
        .find_map(|t| {
            let got_title = t.get("title").and_then(Value::as_str).unwrap_or("");
            let got_artist = t
                .pointer("/user/name")
                .and_then(Value::as_str)
                .unwrap_or("");
            let got_secs = t.get("duration").and_then(Value::as_f64);
            is_match(
                artist,
                title,
                duration_secs,
                got_artist,
                got_title,
                got_secs,
            )
            .then(|| t.get("id").and_then(Value::as_str).map(str::to_string))
            .flatten()
        })
        .ok_or_else(|| "no matching Audius track".to_string())?;

    Ok(format!("{API}/tracks/{id}/stream?app_name={APP_NAME}"))
}
