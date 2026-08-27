use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Serialize;
use tokio::sync::RwLock;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::annotations::{
    AnnotationMutationRequest, AnnotationStore, AnnotationStoreError, AuthoredSpatialAnnotation,
};
use crate::project::ProjectSnapshot;

#[derive(Clone)]
struct AppState {
    snapshot: Arc<ProjectSnapshot>,
    annotations: Arc<RwLock<AnnotationStore>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiError {
    error: String,
}

type ApiResult<T> = Result<T, (StatusCode, Json<ApiError>)>;

async fn health() -> &'static str {
    "ok"
}

async fn project(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.snapshot)
}

async fn annotations(State(state): State<AppState>) -> Json<Vec<AuthoredSpatialAnnotation>> {
    Json(state.annotations.read().await.records().to_vec())
}

async fn create_annotation(
    State(state): State<AppState>,
    Json(request): Json<AnnotationMutationRequest>,
) -> ApiResult<(StatusCode, Json<AuthoredSpatialAnnotation>)> {
    let record = state
        .annotations
        .write()
        .await
        .create(&state.snapshot, request)
        .map_err(api_error)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn update_annotation(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<AnnotationMutationRequest>,
) -> ApiResult<Json<AuthoredSpatialAnnotation>> {
    let record = state
        .annotations
        .write()
        .await
        .update(&state.snapshot, &id, request)
        .map_err(api_error)?;
    Ok(Json(record))
}

async fn delete_annotation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state
        .annotations
        .write()
        .await
        .delete(&id)
        .map_err(api_error)?;
    Ok(StatusCode::NO_CONTENT)
}

fn api_error(error: AnnotationStoreError) -> (StatusCode, Json<ApiError>) {
    let status = match &error {
        AnnotationStoreError::NotFound(_) => StatusCode::NOT_FOUND,
        AnnotationStoreError::Invalid(_)
        | AnnotationStoreError::Spatial(_)
        | AnnotationStoreError::Media(_) => StatusCode::BAD_REQUEST,
        AnnotationStoreError::Io(_) | AnnotationStoreError::Json(_) => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    };
    (
        status,
        Json(ApiError {
            error: error.to_string(),
        }),
    )
}

pub async fn serve(
    address: SocketAddr,
    snapshot: ProjectSnapshot,
    video_path: PathBuf,
    frontend_dir: PathBuf,
    annotations_path: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let annotations = AnnotationStore::load(annotations_path)?;
    let index = frontend_dir.join("index.html");
    let static_files = ServeDir::new(frontend_dir).not_found_service(ServeFile::new(index));
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/project", get(project))
        .route("/api/annotations", get(annotations).post(create_annotation))
        .route(
            "/api/annotations/{id}",
            put(update_annotation).delete(delete_annotation),
        )
        .route_service("/media/video", ServeFile::new(video_path))
        .fallback_service(static_files)
        .layer(TraceLayer::new_for_http())
        .with_state(AppState {
            snapshot: Arc::new(snapshot),
            annotations: Arc::new(RwLock::new(annotations)),
        });

    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
