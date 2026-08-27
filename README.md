# spatial-media-explorer

A small product canary for the neutral media + spatial annotation architecture.

The MVP opens one video beside an existing COLMAP text reconstruction and keeps the two views connected:

- video playback selects the nearest reconstructed camera pose;
- the 3D view renders the sparse COLMAP point cloud and camera directions;
- clicking a sparse point lists the source frames that observed it;
- selecting an observation seeks the video and overlays the corresponding 2D keypoint region;
- backend correspondences are built with the real `MediaAnnotation` selector vocabulary and `SpatialBinding` types rather than app-local replacements.

## MVP input contract

The COLMAP directory must be a text model containing:

- `cameras.txt`
- `images.txt`
- `points3D.txt`

COLMAP image filenames must contain a frame number. The explorer uses the **last integer in the filename stem** as the video frame index. Use `--frame-offset -1` for one-based extracted filenames such as `frame_000001.png` when that file represents video frame zero.

The current MVP supports exact pinhole intrinsics for COLMAP `PINHOLE` and `SIMPLE_PINHOLE` cameras. Other camera models still retain an opaque COLMAP calibration reference in the spatial binding, but do not claim canonical pinhole parameters.

## Source-first setup

The Rust app intentionally consumes the spatial/media crates from a sibling `rust-packages` checkout. Publication is not required for ordinary development.

```bash
git clone https://github.com/moritzbrantner/rust-packages.git
cd rust-packages
git checkout 196820c7b681326ed77c01bcd7ace7da76c9fcbb
cd ..
git clone https://github.com/moritzbrantner/spatial-media-explorer.git
cd spatial-media-explorer
```

The exact expected source revision is also recorded in `.coding-tooling.source-deps.json`.

## Run

Build the frontend:

```bash
cd frontend
bun install
bun run build
cd ..
```

Start the explorer:

```bash
cargo run -- \
  --video /path/to/video.mp4 \
  --colmap /path/to/sparse/0 \
  --fps 30 \
  --frame-offset -1
```

Open `http://127.0.0.1:1420`.

For frontend development, leave the Rust server running and start Vite separately:

```bash
cd frontend
bun run dev
```

Vite serves `http://127.0.0.1:5173` and proxies `/api` and `/media` to the Rust process.

## Verification

Repository-local hosted CI verifies the source dependency contract, Rust formatting, frontend formatting/lint/tests, and the frontend production build. Rust compilation and Rust tests run in a local/source-enabled workspace where the exact sibling `rust-packages` revision is available.

Useful local checks:

```bash
rustfmt --edition 2024 --check src/*.rs
cargo test
cd frontend
bun run verify
```

## Deliberate MVP boundaries

This repository does not yet own reconstruction, video frame extraction, COLMAP execution, Gaussian-splat rendering, annotation persistence, trajectories, georeferencing, or editing. It consumes existing reconstruction output and lets the first product experience determine which shared spatial primitives are actually missing.
