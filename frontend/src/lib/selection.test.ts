import { describe, expect, it } from "vitest";
import { frameIndexAtTime, nearestCamera, observationAtFrame } from "./selection";
import type { CameraObservation, PointObservation } from "../types";

function camera(frameIndex: number): CameraObservation {
  return {
    imageId: frameIndex,
    imageName: `frame_${frameIndex}.png`,
    cameraId: 1,
    frameIndex,
    timeSeconds: frameIndex / 30,
    imageSize: [640, 360],
    position: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    forward: [0, 0, 1],
    binding: { schemaVersion: 1, spatial: {} },
  };
}

function observation(frameIndex: number): PointObservation {
  return {
    imageId: frameIndex,
    imageName: `frame_${frameIndex}.png`,
    frameIndex,
    timeSeconds: frameIndex / 30,
    region: {
      x: 10,
      y: 20,
      width: 12,
      height: 12,
      imageWidth: 640,
      imageHeight: 360,
    },
    binding: { schemaVersion: 1, spatial: {} },
  };
}

describe("selection helpers", () => {
  it("maps playback time to the containing frame", () => {
    expect(frameIndexAtTime(1.5, 30)).toBe(45);
    expect(frameIndexAtTime(10.75 / 30, 30)).toBe(10);
  });

  it("finds the nearest reconstructed camera frame", () => {
    expect(nearestCamera([camera(10), camera(30), camera(50)], 34)?.frameIndex).toBe(30);
  });

  it("only returns point observations for the exact displayed frame", () => {
    const observations = [observation(10), observation(20)];
    expect(observationAtFrame(observations, 15)).toBeNull();
    expect(observationAtFrame(observations, 20)?.frameIndex).toBe(20);
  });
});
