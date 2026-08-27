use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

use clap::Parser;
use spatial_media_explorer::project::{ProjectInput, load_project};
use spatial_media_explorer::server::serve;

#[derive(Debug, Parser)]
#[command(author, version, about)]
struct Args {
    /// Source video displayed in the media pane.
    #[arg(long)]
    video: PathBuf,
    /// COLMAP text model directory containing cameras.txt, images.txt, and points3D.txt.
    #[arg(long)]
    colmap: PathBuf,
    /// Frames per second used to map extracted COLMAP image names back to video time.
    #[arg(long)]
    fps: f64,
    /// Signed offset applied to the last integer found in each COLMAP image filename.
    #[arg(long, default_value_t = 0)]
    frame_offset: i64,
    /// Maximum number of sparse points sent to the browser. Sampling is deterministic.
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,
    /// Built frontend directory.
    #[arg(long, default_value = "frontend/dist")]
    frontend_dir: PathBuf,
    /// HTTP port.
    #[arg(long, default_value_t = 1420)]
    port: u16,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let snapshot = load_project(&ProjectInput {
        video_path: args.video.clone(),
        colmap_dir: args.colmap,
        fps: args.fps,
        frame_offset: args.frame_offset,
        max_points: args.max_points,
    })?;
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), args.port);
    println!("Spatial Media Explorer: http://{address}");
    serve(address, snapshot, args.video, args.frontend_dir).await?;
    Ok(())
}
