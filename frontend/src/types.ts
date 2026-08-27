export type Vec3 = [number, number, number];

export type SpatialBindingWire = {
  schemaVersion: number;
  spatial: unknown;
  sourceSelector?: unknown;
};

export type Region2d = {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
};

export type PointObservation = {
  imageId: number;
  imageName: string;
  frameIndex: number;
  timeSeconds: number;
  region: Region2d;
  binding: SpatialBindingWire;
};

export type ScenePoint = {
  id: number;
  position: Vec3;
  reprojectionError: number;
  observations: PointObservation[];
};

export type CameraObservation = {
  imageId: number;
  imageName: string;
  cameraId: number;
  frameIndex: number;
  timeSeconds: number;
  imageSize: [number, number];
  position: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  binding: SpatialBindingWire;
};

export type SceneBounds = {
  min: Vec3;
  max: Vec3;
};

export type ProjectSnapshot = {
  videoUrl: string;
  videoName: string;
  fps: number;
  frameOffset: number;
  cameraCount: number;
  sourcePointCount: number;
  renderedPointCount: number;
  bounds: SceneBounds;
  cameras: CameraObservation[];
  points: ScenePoint[];
};
