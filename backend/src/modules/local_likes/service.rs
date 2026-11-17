use std::collections::HashSet;
use std::sync::Arc;

use serde_json::Value;
use sqlx::PgPool;

use crate::error::AppResult;

pub struct LocalLikesService {
    pg: PgPool,
}

impl LocalLikesService {
    pub fn new(pg: PgPool) -> Arc<Self> {
        Arc::new(Self { pg })
    }

    pub async fn add(
        &self,
        sc_user_id: &str,
        sc_track_id: &str,
        track_data: &Value,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO local_likes (soundcloud_user_id, sc_track_id, track_data) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (soundcloud_user_id, sc_track_id) DO NOTHING",
        )
        .bind(sc_user_id)
        .bind(sc_track_id)
        .bind(track_data)
        .execute(&self.pg)
        .await?;
        Ok(())
    }

    pub async fn remove(&self, sc_user_id: &str, sc_track_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM local_likes WHERE soundcloud_user_id = $1 AND sc_track_id = $2")
            .bind(sc_user_id)
            .bind(sc_track_id)
            .execute(&self.pg)
            .await?;
        Ok(())
    }

    pub async fn get_liked_track_ids(
        &self,
        sc_user_id: &str,
        sc_track_ids: &[String],
    ) -> AppResult<HashSet<String>> {
        if sc_track_ids.is_empty() {
            return Ok(HashSet::new());
        }
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT sc_track_id FROM local_likes \
             WHERE soundcloud_user_id = $1 AND sc_track_id = ANY($2)",
        )
        .bind(sc_user_id)
        .bind(sc_track_ids)
        .fetch_all(&self.pg)
        .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}
