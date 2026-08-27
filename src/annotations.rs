use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use media_core::annotations::{
    AnnotationProvenance, AnnotationSelector, AnnotationValue, MediaAnnotation, MediaSourceRef,
};
use media_core::{Timebase, Timestamp};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use three_d_processing_core::annotations::{
    CoordinateFrameRef, CoordinateUnit, SpatialBinding, SpatialSelector,
};
use three_d_processing_core::Point3d;

use crate::project::ProjectSnapshot;

const FILE_SCHEMA_VERSION: u32 = 1;
const FRAME_INDEX_ATTRIBUTE: &str = "frameIndex";
const COLMAP_POINT_ID_ATTRIBUTE: &str = "colmapPointId";
const REGION_IMAGE_WIDTH_ATTRIBUTE: &str = "regionImageWidth";
const REGION_IMAGE_HEIGHT_ATTRIBUTE: &str = "regionImageHeight";
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Error)]
pub enum AnnotationStoreError {
    #[error("annotation file I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("annotation JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid annotation request: {0}")]
    Invalid(String),
    #[error("spatial contract error: {0}")]
    Spatial(String),
    #[error("media annotation contract error: {0}")]
    Media(String),
    #[error("annotation `{0}` was not found")]
    NotFound(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoredSpatialAnnotation {
    pub annotation: MediaAnnotation,
    pub binding: SpatialBinding,
}

impl AuthoredSpatialAnnotation {
    fn validate(&self) -> Result<(), AnnotationStoreError> {
        self.annotation
            .validate()
            .map_err(|error| AnnotationStoreError::Media(error.to_string()))?;
        self.binding
            .validate()
            .map_err(|error| AnnotationStoreError::Spatial(error.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationFile {
    schema_version: u32,
    #[serde(default)]
    records: Vec<AuthoredSpatialAnnotation>,
}

impl Default for AnnotationFile {
    fn default() -> Self {
        Self {
            schema_version: FILE_SCHEMA_VERSION,
            records: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationMutationRequest {
    pub point_id: u64,
    pub frame_index: u64,
    pub label: String,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub region: Option<RegionInput>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionInput {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub image_width: u32,
    pub image_height: u32,
}

impl RegionInput {
    fn validate(self) -> Result<(), AnnotationStoreError> {
        if self.image_width == 0 || self.image_height == 0 {
            return Err(AnnotationStoreError::Invalid(
                "region image dimensions must be greater than zero".to_string(),
            ));
        }
        if [self.x, self.y, self.width, self.height]
            .into_iter()
            .any(|value| !value.is_finite())
            || self.width <= 0.0
            || self.height <= 0.0
        {
            return Err(AnnotationStoreError::Invalid(
                "region must be finite with positive width and height".to_string(),
            ));
        }
        if self.x < 0.0
            || self.y < 0.0
            || self.x + self.width > f64::from(self.image_width) + f64::EPSILON
            || self.y + self.height > f64::from(self.image_height) + f64::EPSILON
        {
            return Err(AnnotationStoreError::Invalid(
                "region must stay inside the source image".to_string(),
            ));
        }
        Ok(())
    }

    fn selector(self) -> AnnotationSelector {
        AnnotationSelector::Region2d {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
            coordinate_space: Some("pixels".to_string()),
        }
    }
}

#[derive(Debug)]
pub struct AnnotationStore {
    path: Option<PathBuf>,
    records: Vec<AuthoredSpatialAnnotation>,
}

impl AnnotationStore {
    pub fn load(path: Option<PathBuf>) -> Result<Self, AnnotationStoreError> {
        let records = match path.as_deref() {
            Some(path) if path.is_file() => {
                let file = serde_json::from_slice::<AnnotationFile>(&fs::read(path)?)?;
                if file.schema_version != FILE_SCHEMA_VERSION {
                    return Err(AnnotationStoreError::Invalid(format!(
                        "unsupported annotation file schema version {}",
                        file.schema_version
                    )));
                }
                for record in &file.records {
                    record.validate()?;
                }
                file.records
            }
            _ => Vec::new(),
        };
        Ok(Self { path, records })
    }

    pub fn records(&self) -> &[AuthoredSpatialAnnotation] {
        &self.records
    }

    pub fn create(
        &mut self,
        project: &ProjectSnapshot,
        request: AnnotationMutationRequest,
    ) -> Result<AuthoredSpatialAnnotation, AnnotationStoreError> {
        let id = next_annotation_id();
        let record = build_record(project, id, request)?;
        self.records.push(record.clone());
        self.persist()?;
        Ok(record)
    }

    pub fn update(
        &mut self,
        project: &ProjectSnapshot,
        id: &str,
        request: AnnotationMutationRequest,
    ) -> Result<AuthoredSpatialAnnotation, AnnotationStoreError> {
        let index = self
            .records
            .iter()
            .position(|record| record.annotation.id == id)
            .ok_or_else(|| AnnotationStoreError::NotFound(id.to_string()))?;
        let record = build_record(project, id.to_string(), request)?;
        self.records[index] = record.clone();
        self.persist()?;
        Ok(record)
    }

    pub fn delete(&mut self, id: &str) -> Result<(), AnnotationStoreError> {
        let before = self.records.len();
        self.records.retain(|record| record.annotation.id != id);
        if before == self.records.len() {
            return Err(AnnotationStoreError::NotFound(id.to_string()));
        }
        self.persist()
    }

    fn persist(&self) -> Result<(), AnnotationStoreError> {
        let Some(path) = self.path.as_deref() else {
            return Ok(());
        };
        if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
            fs::create_dir_all(parent)?;
        }
        let file = AnnotationFile {
            schema_version: FILE_SCHEMA_VERSION,
            records: self.records.clone(),
        };
        for record in &file.records {
            record.validate()?;
        }
        let bytes = serde_json::to_vec_pretty(&file)?;
        let temporary = temporary_path(path);
        fs::write(&temporary, bytes)?;
        fs::rename(temporary, path)?;
        Ok(())
    }
}

fn build_record(
    project: &ProjectSnapshot,
    id: String,
    request: AnnotationMutationRequest,
) -> Result<AuthoredSpatialAnnotation, AnnotationStoreError> {
    let label = request.label.trim();
    if label.is_empty() {
        return Err(AnnotationStoreError::Invalid(
            "annotation label must not be empty".to_string(),
        ));
    }
    let point = project
        .points
        .iter()
        .find(|point| point.id == request.point_id)
        .ok_or_else(|| {
            AnnotationStoreError::Invalid(format!(
                "COLMAP point {} is not present in the rendered project",
                request.point_id
            ))
        })?;
    if let Some(region) = request.region {
        region.validate()?;
    }

    let source_selector = request
        .region
        .map(RegionInput::selector)
        .unwrap_or(AnnotationSelector::Frame {
            frame_index: request.frame_index,
        });
    source_selector
        .validate()
        .map_err(|error| AnnotationStoreError::Media(error.to_string()))?;

    let scene_frame = CoordinateFrameRef::local("colmap-world")
        .map_err(spatial_error)?
        .unit(CoordinateUnit::Arbitrary);
    let binding = SpatialBinding::new(SpatialSelector::Point3 {
        frame: scene_frame,
        point: Point3d::new(point.position[0], point.position[1], point.position[2]),
        uncertainty: None,
    })
    .map_err(spatial_error)?
    .with_source_selector(source_selector.clone())
    .map_err(spatial_error)?;

    let timestamp = timestamp_for_frame(request.frame_index, project.fps)?;
    let mut provenance = AnnotationProvenance::analyzer("spatial-media-explorer");
    provenance.operation = Some("manual_spatial_annotation".to_string());
    let mut annotation = MediaAnnotation::new(id, "spatial_note")
        .label(label)
        .at(timestamp)
        .source(
            MediaSourceRef::source(project.video_name.clone()).source_kind("video"),
        )
        .selector(source_selector)
        .provenance(provenance)
        .attribute(FRAME_INDEX_ATTRIBUTE, request.frame_index.to_string())
        .attribute(COLMAP_POINT_ID_ATTRIBUTE, request.point_id.to_string());

    if let Some(note) = request.note.map(|note| note.trim().to_string()) {
        if !note.is_empty() {
            annotation = annotation.value(AnnotationValue::Text(note));
        }
    }
    if let Some(region) = request.region {
        annotation = annotation
            .attribute(REGION_IMAGE_WIDTH_ATTRIBUTE, region.image_width.to_string())
            .attribute(REGION_IMAGE_HEIGHT_ATTRIBUTE, region.image_height.to_string());
    }
    annotation
        .validate()
        .map_err(|error| AnnotationStoreError::Media(error.to_string()))?;

    let record = AuthoredSpatialAnnotation {
        annotation,
        binding,
    };
    record.validate()?;
    Ok(record)
}

fn timestamp_for_frame(frame_index: u64, fps: f64) -> Result<Timestamp, AnnotationStoreError> {
    if !fps.is_finite() || fps <= 0.0 {
        return Err(AnnotationStoreError::Invalid(
            "project fps must be finite and greater than zero".to_string(),
        ));
    }
    let microseconds = ((frame_index as f64 / fps) * 1_000_000.0).round();
    if !microseconds.is_finite() || microseconds > i64::MAX as f64 {
        return Err(AnnotationStoreError::Invalid(
            "annotation timestamp is outside the supported range".to_string(),
        ));
    }
    let timebase = Timebase::try_new(1, 1_000_000)
        .map_err(|error| AnnotationStoreError::Media(error.to_string()))?;
    Timestamp::try_new(microseconds as i64, timebase)
        .map_err(|error| AnnotationStoreError::Media(error.to_string()))
}

fn next_annotation_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let sequence = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("manual-{millis}-{sequence}")
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".tmp");
    PathBuf::from(value)
}

fn spatial_error(error: impl std::fmt::Display) -> AnnotationStoreError {
    AnnotationStoreError::Spatial(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;
    use crate::project::{ProjectInput, load_project};

    #[test]
    fn persists_and_reloads_a_manual_point_annotation() {
        let temp = tempdir().expect("tempdir");
        let video = temp.path().join("sample.mp4");
        fs::write(&video, b"fixture").expect("video fixture");
        let project = load_project(&ProjectInput {
            video_path: video,
            colmap_dir: PathBuf::from("fixtures/colmap"),
            fps: 30.0,
            frame_offset: 0,
            max_points: 100,
        })
        .expect("fixture project should load");
        let path = temp.path().join("annotations.json");
        let mut store = AnnotationStore::load(Some(path.clone())).expect("empty store");
        let point_id = project.points[0].id;

        let created = store
            .create(
                &project,
                AnnotationMutationRequest {
                    point_id,
                    frame_index: 1,
                    label: "door".to_string(),
                    note: Some("north entrance".to_string()),
                    region: None,
                },
            )
            .expect("annotation should be created");

        assert_eq!(created.annotation.label.as_deref(), Some("door"));
        let reloaded = AnnotationStore::load(Some(path)).expect("stored file should reload");
        assert_eq!(reloaded.records().len(), 1);
        assert_eq!(reloaded.records()[0].annotation.id, created.annotation.id);
    }
}
