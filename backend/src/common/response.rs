use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::Value;

use crate::cache::cache_service::CacheScope;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn json_response(status: StatusCode, body: String) -> Response {
    (
        status,
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        )],
        body,
    )
        .into_response()
}

/// Serve a JSON response from the shared cache, or fetch, cache and serve it.
#[allow(clippy::too_many_arguments)]
pub async fn cached_or_fetch<F, Fut>(
    st: &AppState,
    method: &str,
    url: &str,
    scope: CacheScope,
    session_id: Option<&str>,
    ttl_sec: u64,
    cache_key: Option<&str>,
    fetch: F,
) -> AppResult<Response>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = AppResult<Value>>,
{
    let key = st.cache.build_key(method, url, scope, session_id);
    if let Ok(Some(raw)) = st.cache.get_raw(&key).await {
        return Ok(json_response(StatusCode::OK, raw));
    }
    let v = fetch().await?;
    let payload =
        serde_json::to_string(&v).map_err(|e| AppError::internal(format!("json encode: {e}")))?;
    let _ = st
        .cache
        .set_raw(&key, &payload, ttl_sec, cache_key, scope, session_id)
        .await;
    Ok(json_response(StatusCode::OK, payload))
}
