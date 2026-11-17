use std::sync::Arc;

use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeaturedItemType {
    Track,
    Playlist,
    User,
}

impl FeaturedItemType {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "track" => Some(Self::Track),
            "playlist" => Some(Self::Playlist),
            "user" => Some(Self::User),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FeaturedItem {
    pub id: Uuid,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub type_: String,
    #[serde(rename = "scUrn")]
    pub sc_urn: String,
    pub weight: i32,
    pub active: bool,
    #[serde(rename = "createdAt")]
    pub created_at: NaiveDateTime,
}

pub struct FeaturedService {
    pg: sqlx::PgPool,
}

impl FeaturedService {
    pub fn new(pg: sqlx::PgPool) -> Arc<Self> {
        Arc::new(Self { pg })
    }

    pub async fn find_all(&self) -> AppResult<Vec<FeaturedItem>> {
        let rows: Vec<FeaturedItem> = sqlx::query_as(
            r#"SELECT id, "type", sc_urn, weight, active, created_at FROM featured_items ORDER BY created_at DESC"#,
        )
        .fetch_all(&self.pg)
        .await?;
        Ok(rows)
    }

    pub async fn create(
        &self,
        type_: &str,
        sc_urn: &str,
        weight: Option<i32>,
        active: Option<bool>,
    ) -> AppResult<FeaturedItem> {
        if FeaturedItemType::parse(type_).is_none() {
            return Err(AppError::bad_request(
                "type must be one of: track, playlist, user",
            ));
        }
        let row: FeaturedItem = sqlx::query_as(
            r#"INSERT INTO featured_items ("type", sc_urn, weight, active) VALUES ($1, $2, $3, $4) RETURNING id, "type", sc_urn, weight, active, created_at"#,
        )
        .bind(type_)
        .bind(sc_urn)
        .bind(weight.unwrap_or(1))
        .bind(active.unwrap_or(true))
        .fetch_one(&self.pg)
        .await?;
        Ok(row)
    }

    pub async fn update(
        &self,
        id: &str,
        type_: Option<&str>,
        sc_urn: Option<&str>,
        weight: Option<i32>,
        active: Option<bool>,
    ) -> AppResult<FeaturedItem> {
        if let Some(t) = type_ {
            if FeaturedItemType::parse(t).is_none() {
                return Err(AppError::bad_request(
                    "type must be one of: track, playlist, user",
                ));
            }
        }
        let uuid = Uuid::parse_str(id)
            .map_err(|_| AppError::not_found(format!("featured item {id} not found")))?;
        let row: Option<FeaturedItem> = sqlx::query_as(
            r#"UPDATE featured_items SET
                "type" = COALESCE($2, "type"),
                sc_urn = COALESCE($3, sc_urn),
                weight = COALESCE($4, weight),
                active = COALESCE($5, active)
             WHERE id = $1
             RETURNING id, "type", sc_urn, weight, active, created_at"#,
        )
        .bind(uuid)
        .bind(type_)
        .bind(sc_urn)
        .bind(weight)
        .bind(active)
        .fetch_optional(&self.pg)
        .await?;
        row.ok_or_else(|| AppError::not_found(format!("featured item {id} not found")))
    }

    pub async fn remove(&self, id: &str) -> AppResult<()> {
        let uuid = match Uuid::parse_str(id) {
            Ok(u) => u,
            Err(_) => return Ok(()),
        };
        sqlx::query("DELETE FROM featured_items WHERE id = $1")
            .bind(uuid)
            .execute(&self.pg)
            .await?;
        Ok(())
    }
}
