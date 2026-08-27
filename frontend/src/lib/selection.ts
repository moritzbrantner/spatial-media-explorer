import type { CameraObservation, PointObservation, ProjectSnapshot, ScenePoint } from "../types";

export function frameIndexAtTime(timeSeconds: number, fps: number): number {
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(fps) || timeSeconds < 0 || fps <= 0) {
    return 0;
  }
  return Math.round(timeSeconds * fps);
}

export function nearestCamera(
  cameras: CameraObservation[],
  frameIndex: number,
): CameraObservation | null {
  if (cameras.length === 0) {
    return null;
  }
  let best = cameras[0];
  let bestDistance = Math.abs(best.frameIndex - frameIndex);
  for (const camera of cameras.slice(1)) {
    const distance = Math.abs(camera.frameIndex - frameIndex);
    if (distance < bestDistance) {
      best = camera;
      bestDistance = distance;
    }
  }
  return best;
}

export function pointById(project: ProjectSnapshot, pointId: number | null): ScenePoint | null {
  if (pointId === null) {
    return null;
  }
  return project.points.find((point) => point.id === pointId) ?? null;
}

export function nearestObservation(
  observations: PointObservation[],
  frameIndex: number,
): PointObservation | null {
  if (observations.length === 0) {
    return null;
  }
  return observations.reduce((best, observation) =>
    Math.abs(observation.frameIndex - frameIndex) < Math.abs(best.frameIndex - frameIndex)
      ? observation
      : best,
  );
}
