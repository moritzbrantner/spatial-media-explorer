import { describe, expect, it } from "vitest";
import { frameIndexAtTime, nearestCamera } from "./selection";
import type { CameraObservation } from "../types";

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

describe("selection helpers", () => {
  it("maps playback time to the nearest frame", () => {
    expect(frameIndexAtTime(1.5, 30)).toBe(45);
  });

  it("finds the nearest reconstructed camera frame", () => {
    expect(nearestCamera([camera(10), camera(30), camera(50)], 34)?.frameIndex).toBe(30);
  });
});
