# spatial-media-explorer

A small product canary for the neutral media + spatial annotation architecture.

The MVP opens one video beside an existing COLMAP text reconstruction and keeps the two views connected:

- video playback selects the nearest reconstructed camera pose;
- the 3D view renders the sparse COLMAP point cloud and camera directions;
- clicking a sparse point lists the source frames that observed it;
- selecting an observation seeks the video and overlays the corresponding 2D keypoint region;
- a selected sparse point can be turned into a labeled, persisted spatial annotation at the current video frame;
- authored annotations can be edited, deleted, selected from either view, and associated with a dragged source-video region;
- annotation filters cover search, kind, current frame, source selector type, and sparse-point visibility, with filter state mirrored into the URL;
- backend correspondences and authored records compose the real `MediaAnnotation` and `SpatialBinding` contracts rather than app-local replacements.

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
  --frame-offset -1 \
  --annotations /path/to/project.spatial-annotations.json
```

`--annotations` is optional. Without it, authoring works for the current process but changes remain in memory. Supplying an explicit sidecar path enables reload-safe persistence without modifying the source video or COLMAP reconstruction. The sidecar is a product-level composition of validated `MediaAnnotation` and `SpatialBinding` values; it does not redefine either source-owned contract.

Open `http://127.0.0.1:1420`.

For frontend development, leave the Rust server running and start Vite separately:

```bash
cd frontend
bun run dev
```

Vite serves `http://127.0.0.1:5173` and proxies `/api` and `/media` to the Rust process.

## Authoring workflow

1. Pause or scrub the video to the desired frame.
2. Select a sparse point in the 3D reconstruction.
3. Create a labeled annotation in the inspector, with an optional note.
4. Select the authored marker and choose **Associate region** to pause the media and drag an exact pixel region over the source video.
5. Select the authored marker from the 3D scene, its media overlay, or the filtered inspector list to seek back to its associated frame.
6. Edit or delete the record from the inspector. Press `Escape` to clear selection or leave region-association mode.

Authored point locations remain tied to rendered COLMAP points in this slice. Free-space placement, boxes, spheres, trajectories, and scene entities remain later extensions.

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

This repository does not own reconstruction, video frame extraction, COLMAP execution, Gaussian-splat rendering, trajectories, georeferencing, a universal scene graph, or generic editor infrastructure. Annotation persistence and editing remain deliberately product-scoped: the explorer only composes the shared media and spatial contracts and uses existing COLMAP points as authoring anchors. New shared abstractions should be introduced only when this product workflow demonstrates a concrete missing capability.
