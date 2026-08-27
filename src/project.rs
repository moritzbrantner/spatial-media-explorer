use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use media_core::annotations::AnnotationSelector;
use serde::Serialize;
use thiserror::Error;
use three_d_processing_core::annotations::{
    CoordinateFrameRef, CoordinateUnit, SpatialBinding, SpatialEntityRef, SpatialSelector,
};
use three_d_processing_core::{CameraPose3d, PinholeIntrinsicsd, Point3d};
use video_analysis_radiance_io::{ColmapCamera, read_colmap_text_dir};

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("video does not exist: {0}")]
    MissingVideo(PathBuf),
    #[error("fps must be finite and greater than zero")]
    InvalidFps,
    #[error("max_points must be greater than zero")]
    InvalidMaxPoints,
    #[error("COLMAP model could not be loaded: {0}")]
    Colmap(String),
    #[error("spatial contract error: {0}")]
    Spatial(String),
    #[error("no COLMAP image filename contains a usable frame number")]
    NoMappedFrames,
}

#[derive(Debug, Clone)]
pub struct ProjectInput {
    pub video_path: PathBuf,
    pub colmap_dir: PathBuf,
    pub fps: f64,
    pub frame_offset: i64,
    pub max_points: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub video_url: String,
    pub video_name: String,
    pub fps: f64,
    pub frame_offset: i64,
    pub camera_count: usize,
    pub source_point_count: usize,
    pub rendered_point_count: usize,
    pub bounds: SceneBounds,
    pub cameras: Vec<CameraObservation>,
    pub points: Vec<ScenePoint>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneBounds {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraObservation {
    pub image_id: u32,
    pub image_name: String,
    pub camera_id: u32,
    pub frame_index: u64,
    pub time_seconds: f64,
    pub image_size: [u32; 2],
    pub position: [f64; 3],
    pub right: [f64; 3],
    pub up: [f64; 3],
    pub forward: [f64; 3],
    pub binding: SpatialBinding,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePoint {
    pub id: u64,
    pub position: [f64; 3],
    pub reprojection_error: f32,
    pub observations: Vec<PointObservation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointObservation {
    pub image_id: u32,
    pub image_name: String,
    pub frame_index: u64,
    pub time_seconds: f64,
    pub region: Region2d,
    pub binding: SpatialBinding,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Region2d {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub image_width: u32,
    pub image_height: u32,
}

pub fn load_project(input: &ProjectInput) -> Result<ProjectSnapshot, ProjectError> {
    if !input.video_path.is_file() {
        return Err(ProjectError::MissingVideo(input.video_path.clone()));
    }
    if !input.fps.is_finite() || input.fps <= 0.0 {
        return Err(ProjectError::InvalidFps);
    }
    if input.max_points == 0 {
        return Err(ProjectError::InvalidMaxPoints);
    }

    let dataset = read_colmap_text_dir(&input.colmap_dir)
        .map_err(|error| ProjectError::Colmap(error.to_string()))?;
    let scene_frame = CoordinateFrameRef::local("colmap-world")
        .map_err(spatial_error)?
        .unit(CoordinateUnit::Arbitrary);
    let cameras_by_id = dataset
        .cameras
        .iter()
        .map(|camera| (camera.id, camera))
        .collect::<BTreeMap<_, _>>();

    let mut mapped_images = BTreeMap::new();
    let mut cameras = Vec::new();
    for image in &dataset.images {
        let Some(frame_index) = frame_index_from_name(&image.name, input.frame_offset) else {
            continue;
        };
        let Some(camera) = cameras_by_id.get(&image.camera_id).copied() else {
            continue;
        };
        let pose = CameraPose3d::from_colmap_world_to_camera(
            f64::from(image.qw),
            f64::from(image.qx),
            f64::from(image.qy),
            f64::from(image.qz),
            f64::from(image.tx),
            f64::from(image.ty),
            f64::from(image.tz),
        )
        .map_err(spatial_error)?;
        let calibration_ref = SpatialEntityRef::new("colmap", "camera", camera.id.to_string())
            .map_err(spatial_error)?;
        let binding = SpatialBinding::new(SpatialSelector::CameraPose {
            frame: scene_frame.clone(),
            pose,
            intrinsics: pinhole_intrinsics(camera)?,
            calibration_ref: Some(calibration_ref),
            uncertainty: None,
        })
        .map_err(spatial_error)?
        .with_source_selector(AnnotationSelector::Frame { frame_index })
        .map_err(spatial_error)?;
        let time_seconds = frame_index as f64 / input.fps;
        mapped_images.insert(image.id, (image, frame_index, time_seconds));
        cameras.push(CameraObservation {
            image_id: image.id,
            image_name: image.name.clone(),
            camera_id: image.camera_id,
            frame_index,
            time_seconds,
            image_size: [camera.width, camera.height],
            position: pose.position.to_array(),
            right: pose.right.to_array(),
            up: pose.up.to_array(),
            forward: pose.forward.to_array(),
            binding,
        });
    }

    if cameras.is_empty() {
        return Err(ProjectError::NoMappedFrames);
    }
    cameras.sort_by_key(|camera| camera.frame_index);

    let source_point_count = dataset.points.len();
    let sample_step = source_point_count.div_ceil(input.max_points).max(1);
    let mut points = Vec::new();
    for point in dataset.points.iter().step_by(sample_step) {
        let point3 = Point3d::new(
            f64::from(point.xyz.x),
            f64::from(point.xyz.y),
            f64::from(point.xyz.z),
        );
        let mut observations = Vec::new();
        for track in &point.track {
            let Some((image, frame_index, time_seconds)) = mapped_images.get(&track.image_id)
            else {
                continue;
            };
            let Some(point2d) = image.points2d.get(track.point2d_index) else {
                continue;
            };
            let Some(camera) = cameras_by_id.get(&image.camera_id).copied() else {
                continue;
            };
            let region = keypoint_region(
                f64::from(point2d.xy.x),
                f64::from(point2d.xy.y),
                camera.width,
                camera.height,
            );
            let media_selector = AnnotationSelector::Region2d {
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height,
                coordinate_space: Some("pixels".to_string()),
            };
            let binding = SpatialBinding::new(SpatialSelector::Point3 {
                frame: scene_frame.clone(),
                point: point3,
                uncertainty: None,
            })
            .map_err(spatial_error)?
            .with_source_selector(media_selector)
            .map_err(spatial_error)?;
            observations.push(PointObservation {
                image_id: image.id,
                image_name: image.name.clone(),
                frame_index: *frame_index,
                time_seconds: *time_seconds,
                region,
                binding,
            });
        }
        points.push(ScenePoint {
            id: point.id,
            position: point3.to_array(),
            reprojection_error: point.error,
            observations,
        });
    }

    let bounds = bounds_for_points(&points);
    let video_name = input
        .video_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("video")
        .to_string();

    Ok(ProjectSnapshot {
        video_url: "/media/video".to_string(),
        video_name,
        fps: input.fps,
        frame_offset: input.frame_offset,
        camera_count: cameras.len(),
        source_point_count,
        rendered_point_count: points.len(),
        bounds,
        cameras,
        points,
    })
}

fn spatial_error(error: impl std::fmt::Display) -> ProjectError {
    ProjectError::Spatial(error.to_string())
}

fn frame_index_from_name(name: &str, offset: i64) -> Option<u64> {
    let stem = Path::new(name).file_stem()?.to_str()?;
    let mut last = None;
    let mut start = None;
    for (index, character) in stem.char_indices() {
        if character.is_ascii_digit() {
            start.get_or_insert(index);
        } else if let Some(from) = start.take() {
            last = stem[from..index].parse::<i64>().ok();
        }
    }
    if let Some(from) = start {
        last = stem[from..].parse::<i64>().ok();
    }
    let shifted = last?.checked_add(offset)?;
    u64::try_from(shifted).ok()
}

fn pinhole_intrinsics(camera: &ColmapCamera) -> Result<Option<PinholeIntrinsicsd>, ProjectError> {
    let values = match camera.raw_model.as_str() {
        "PINHOLE" if camera.params.len() >= 4 => Some((
            camera.params[0],
            camera.params[1],
            camera.params[2],
            camera.params[3],
        )),
        "SIMPLE_PINHOLE" if camera.params.len() >= 3 => Some((
            camera.params[0],
            camera.params[0],
            camera.params[1],
            camera.params[2],
        )),
        _ => None,
    };
    values
        .map(|(fx, fy, cx, cy)| {
            PinholeIntrinsicsd::new(
                camera.width,
                camera.height,
                f64::from(fx),
                f64::from(fy),
                f64::from(cx),
                f64::from(cy),
            )
            .map_err(spatial_error)
        })
        .transpose()
}

fn keypoint_region(x: f64, y: f64, image_width: u32, image_height: u32) -> Region2d {
    let radius = 6.0;
    let max_x = f64::from(image_width);
    let max_y = f64::from(image_height);
    let left = (x - radius).clamp(0.0, max_x);
    let top = (y - radius).clamp(0.0, max_y);
    let right = (x + radius).clamp(left + f64::EPSILON, max_x.max(left + f64::EPSILON));
    let bottom = (y + radius).clamp(top + f64::EPSILON, max_y.max(top + f64::EPSILON));
    Region2d {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        image_width,
        image_height,
    }
}

fn bounds_for_points(points: &[ScenePoint]) -> SceneBounds {
    if points.is_empty() {
        return SceneBounds {
            min: [-1.0, -1.0, -1.0],
            max: [1.0, 1.0, 1.0],
        };
    }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for point in points {
        for axis in 0..3 {
            min[axis] = min[axis].min(point.position[axis]);
            max[axis] = max[axis].max(point.position[axis]);
        }
    }
    SceneBounds { min, max }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn extracts_last_frame_number_and_applies_offset() {
        assert_eq!(frame_index_from_name("frame_000042.png", 0), Some(42));
        assert_eq!(frame_index_from_name("shot_9_frame_001.png", -1), Some(0));
        assert_eq!(frame_index_from_name("frame_000000.png", -1), None);
        assert_eq!(frame_index_from_name("cover.png", 0), None);
    }

    #[test]
    fn loads_fixture_into_camera_and_point_bindings() {
        let temp = tempdir().expect("tempdir");
        let video = temp.path().join("sample.mp4");
        fs::write(&video, b"fixture").expect("video fixture");
        let snapshot = load_project(&ProjectInput {
            video_path: video,
            colmap_dir: PathBuf::from("fixtures/colmap"),
            fps: 30.0,
            frame_offset: 0,
            max_points: 100,
        })
        .expect("fixture project should load");

        assert_eq!(snapshot.cameras.len(), 2);
        assert_eq!(snapshot.points.len(), 1);
        assert_eq!(snapshot.points[0].observations.len(), 2);
        assert_eq!(snapshot.cameras[0].frame_index, 1);
        assert_eq!(snapshot.cameras[1].frame_index, 2);
    }
}
