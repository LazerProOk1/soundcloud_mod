//! Import by link: turns a Yandex Music / Spotify / SoundCloud URL into a plain track
//! list. SoundCloud items come with their URN; the rest are matched on SoundCloud by
//! artist + title in the frontend.

use reqwest::Client;
use serde_json::Value;
use tauri::State;

use crate::track_cache::TrackCacheState;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const YM_API: &str = "https://api.music.yandex.net";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinkTrack {
    pub artist: String,
    pub title: String,
    pub duration_ms: Option<u64>,
    /// Set for SoundCloud items: no matching needed.
    pub urn: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LinkList {
    pub source: String,
    pub title: String,
    pub tracks: Vec<LinkTrack>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

async fn get_json(client: &Client, url: &str) -> Result<Value, String> {
    client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("{url}: {e}"))?
        .json()
        .await
        .map_err(|e| format!("{url}: {e}"))
}

fn str_at<'a>(v: &'a Value, ptr: &str) -> &'a str {
    v.pointer(ptr).and_then(Value::as_str).unwrap_or("")
}

/* ── Yandex Music ─────────────────────────────────────────── */

fn ym_track(t: &Value) -> Option<LinkTrack> {
    // Playlist items wrap the track: {"track": {...}}.
    let t = t.get("track").unwrap_or(t);
    let title = t.get("title")?.as_str()?.to_string();
    let artist = t
        .get("artists")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.get("name").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    Some(LinkTrack {
        artist,
        title,
        duration_ms: t.get("durationMs").and_then(Value::as_u64),
        urn: None,
    })
}

fn ym_tracks(list: Option<&Value>) -> Vec<LinkTrack> {
    list.and_then(Value::as_array)
        .map(|a| a.iter().filter_map(ym_track).collect())
        .unwrap_or_default()
}

async fn yandex(client: &Client, segs: &[&str]) -> Result<LinkList, String> {
    let list = |title: &str, tracks| LinkList {
        source: "yandex".into(),
        title: title.to_string(),
        tracks,
    };
    match segs {
        ["users", user, "playlists", kind, ..] => {
            let v = get_json(client, &format!("{YM_API}/users/{user}/playlists/{kind}")).await?;
            let r = &v["result"];
            Ok(list(str_at(r, "/title"), ym_tracks(r.get("tracks"))))
        }
        ["playlists", uuid, ..] => {
            let v = get_json(client, &format!("{YM_API}/playlist/{uuid}")).await?;
            let r = &v["result"];
            Ok(list(str_at(r, "/title"), ym_tracks(r.get("tracks"))))
        }
        ["album", _, "track", id, ..] | ["track", id, ..] => {
            let v = get_json(client, &format!("{YM_API}/tracks/{id}")).await?;
            let tracks = ym_tracks(v.get("result"));
            let title = tracks.first().map(|t| t.title.clone()).unwrap_or_default();
            Ok(list(&title, tracks))
        }
        ["album", id, ..] => {
            let v = get_json(client, &format!("{YM_API}/albums/{id}/with-tracks")).await?;
            let r = &v["result"];
            let tracks = r
                .get("volumes")
                .and_then(Value::as_array)
                .map(|vols| vols.iter().flat_map(|vol| ym_tracks(Some(vol))).collect())
                .unwrap_or_default();
            Ok(list(str_at(r, "/title"), tracks))
        }
        ["artist", id, ..] => {
            let v = get_json(
                client,
                &format!("{YM_API}/artists/{id}/tracks?page=0&page-size=50"),
            )
            .await?;
            let tracks = ym_tracks(v.pointer("/result/tracks"));
            let name = tracks.first().map(|t| t.artist.clone()).unwrap_or_default();
            Ok(list(&name, tracks))
        }
        _ => Err("unsupported Yandex Music link".into()),
    }
}

/// Yandex Music "Liked" with the user's OAuth token. The API wants a client header;
/// without it some requests are refused or return an empty library.
#[tauri::command]
pub async fn import_fetch_yandex_likes(token: String) -> Result<LinkList, String> {
    let token = token.trim().trim_start_matches("OAuth ").to_string();
    if token.is_empty() {
        return Err("empty token".into());
    }
    let client = client()?;
    let get = |url: String| {
        client
            .get(url)
            .header("Authorization", format!("OAuth {token}"))
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
            .header("Accept", "application/json")
            .send()
    };
    let status = get(format!("{YM_API}/account/status"))
        .await
        .map_err(|e| format!("Yandex Music: {e}"))?;
    if status.status().as_u16() == 401 || status.status().as_u16() == 403 {
        return Err("Yandex Music: token rejected (copy it again)".into());
    }
    let status: Value = status
        .error_for_status()
        .map_err(|e| format!("Yandex Music: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Yandex Music: {e}"))?;
    let uid = status
        .pointer("/result/account/uid")
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .ok_or("Yandex Music: no account in the token response")?;

    let likes: Value = get(format!("{YM_API}/users/{uid}/likes/tracks"))
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Yandex Music likes: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Yandex Music likes: {e}"))?;
    // Ids come as "123:456" (track:album) or numbers.
    let ids: Vec<String> = likes
        .pointer("/result/library/tracks")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|t| {
                    let id = t.get("id")?;
                    let id = id
                        .as_str()
                        .map(str::to_string)
                        .or_else(|| id.as_u64().map(|n| n.to_string()))?;
                    Some(id.split(':').next().unwrap_or(&id).to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Err("Yandex Music: no liked tracks".into());
    }

    let mut tracks = Vec::with_capacity(ids.len());
    for chunk in ids.chunks(100) {
        let res: Value = client
            .post(format!("{YM_API}/tracks"))
            .header("Authorization", format!("OAuth {token}"))
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
            .form(&[("track-ids", chunk.join(","))])
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Yandex Music tracks: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Yandex Music tracks: {e}"))?;
        tracks.extend(ym_tracks(res.get("result")));
    }
    Ok(LinkList {
        source: "yandex".into(),
        title: "Yandex Music".into(),
        tracks,
    })
}

/* ── Spotify (public embed page, no account needed) ────────── */

fn next_data(html: &str) -> Option<Value> {
    let start = html.find("id=\"__NEXT_DATA__\"")?;
    let body = &html[start..];
    let open = body.find('>')? + 1;
    let close = body[open..].find("</script>")?;
    serde_json::from_str(&body[open..open + close]).ok()
}

async fn spotify(client: &Client, kind: &str, id: &str) -> Result<LinkList, String> {
    let html = client
        .get(format!("https://open.spotify.com/embed/{kind}/{id}"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("spotify: {e}"))?
        .text()
        .await
        .map_err(|e| format!("spotify: {e}"))?;
    let data = next_data(&html).ok_or("spotify: page format changed")?;
    let entity = data
        .pointer("/props/pageProps/state/data/entity")
        .ok_or("spotify: no data")?;
    let title = entity
        .get("name")
        .or_else(|| entity.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let tracks = match entity.get("trackList").and_then(Value::as_array) {
        Some(list) => list
            .iter()
            .filter_map(|t| {
                Some(LinkTrack {
                    title: t.get("title")?.as_str()?.to_string(),
                    // "subtitle" is the comma-separated artist list.
                    artist: str_at(t, "/subtitle").replace('\u{a0}', " "),
                    duration_ms: t.get("duration").and_then(Value::as_u64),
                    urn: None,
                })
            })
            .collect(),
        None => vec![LinkTrack {
            title: title.clone(),
            artist: entity
                .get("artists")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.get("name").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default(),
            duration_ms: entity.get("duration").and_then(Value::as_u64),
            urn: None,
        }],
    };
    Ok(LinkList {
        source: "spotify".into(),
        title,
        tracks,
    })
}

/* ── SoundCloud (resolve with the public client id) ────────── */

fn sc_track(t: &Value) -> Option<LinkTrack> {
    let id = t.get("id")?.as_u64()?;
    Some(LinkTrack {
        artist: str_at(t, "/user/username").to_string(),
        title: str_at(t, "/title").to_string(),
        duration_ms: t.get("duration").and_then(Value::as_u64),
        urn: Some(format!("soundcloud:tracks:{id}")),
    })
}

async fn soundcloud(state: &TrackCacheState, url: &str) -> Result<LinkList, String> {
    let v = state.resolve_soundcloud_url(url).await?;
    let title = str_at(&v, "/title").to_string();
    let tracks = match v.get("kind").and_then(Value::as_str) {
        Some("track") => sc_track(&v).into_iter().collect(),
        // Playlist entries past the first few are id-only stubs; the URN is all we need.
        Some("playlist") | Some("system-playlist") => v
            .get("tracks")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(sc_track).collect())
            .unwrap_or_default(),
        _ => return Err("unsupported SoundCloud link (track or playlist expected)".into()),
    };
    Ok(LinkList {
        source: "soundcloud".into(),
        title,
        tracks,
    })
}

#[tauri::command]
pub async fn import_fetch_link(
    url: String,
    state: State<'_, TrackCacheState>,
) -> Result<LinkList, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| "not a link".to_string())?;
    let host = parsed.host_str().unwrap_or("").trim_start_matches("www.");
    let segs: Vec<&str> = parsed
        .path_segments()
        .map(|s| s.filter(|x| !x.is_empty()).collect())
        .unwrap_or_default();
    let client = client()?;
    let list = if host.starts_with("music.yandex.") {
        yandex(&client, &segs).await?
    } else if host == "open.spotify.com" {
        // Optional locale prefix: /intl-ru/playlist/{id}
        let s: Vec<&str> = segs
            .iter()
            .copied()
            .skip_while(|x| x.starts_with("intl-"))
            .collect();
        match s.as_slice() {
            [kind @ ("playlist" | "album" | "track"), id, ..] => spotify(&client, kind, id).await?,
            _ => return Err("unsupported Spotify link".into()),
        }
    } else if host.ends_with("soundcloud.com") {
        soundcloud(&state, url.trim()).await?
    } else {
        return Err("unsupported link".into());
    };
    if list.tracks.is_empty() {
        return Err("no tracks found at this link".into());
    }
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_next_data_and_ym_tracks() {
        let html =
            r#"<html><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></html>"#;
        assert_eq!(next_data(html), Some(serde_json::json!({"a": 1})));
        let item = serde_json::json!({"track": {"title": "T", "durationMs": 1000, "artists": [{"name": "A"}, {"name": "B"}]}});
        assert_eq!(
            ym_track(&item),
            Some(LinkTrack {
                artist: "A, B".into(),
                title: "T".into(),
                duration_ms: Some(1000),
                urn: None
            })
        );
    }
}
