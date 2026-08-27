use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::project::ProjectSnapshot;

#[derive(Clone)]
struct AppState {
    snapshot: Arc<ProjectSnapshot>,
}

async fn health() -> &'static str {
    "ok"
}

async fn project(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.snapshot)
}

pub async fn serve(
    address: SocketAddr,
    snapshot: ProjectSnapshot,
    video_path: PathBuf,
    frontend_dir: PathBuf,
) -> Result<(), std::io::Error> {
    let index = frontend_dir.join("index.html");
    let static_files = ServeDir::new(frontend_dir).not_found_service(ServeFile::new(index));
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/project", get(project))
        .route_service("/media/video", ServeFile::new(video_path))
        .fallback_service(static_files)
        .layer(TraceLayer::new_for_http())
        .with_state(AppState {
            snapshot: Arc::new(snapshot),
        });

    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await
}
