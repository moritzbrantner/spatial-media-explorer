import { describe, expect, it } from "vitest";
import { annotationView, filterAnnotationViews, type AnnotationFilters } from "./annotations";
import type { AuthoredSpatialAnnotation } from "../types";

const record: AuthoredSpatialAnnotation = {
  annotation: {
    id: "manual-1",
    kind: "spatial_note",
    label: "Door",
    selector: { kind: "region2d", x: 10, y: 20, width: 30, height: 40 },
    value: { type: "text", value: "North entrance" },
    attributes: {
      frameIndex: "12",
      colmapPointId: "7",
      regionImageWidth: "1920",
      regionImageHeight: "1080",
    },
  },
  binding: {
    schemaVersion: 1,
    spatial: {
      kind: "point3",
      frame: { id: "colmap-world", kind: "local", unit: "arbitrary" },
      point: { x: 1, y: 2, z: 3 },
    },
    sourceSelector: { kind: "region2d", x: 10, y: 20, width: 30, height: 40 },
  },
};

const filters: AnnotationFilters = {
  search: "",
  currentFrameOnly: false,
  kind: "",
  sourceSelectorKind: "all",
  showSparsePoints: true,
};

describe("authored annotation projections", () => {
  it("recovers navigation and region metadata without redefining the source contracts", () => {
    const view = annotationView(record);
    expect(view).not.toBeNull();
    expect(view?.pointId).toBe(7);
    expect(view?.frameIndex).toBe(12);
    expect(view?.position).toEqual([1, 2, 3]);
    expect(view?.region).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      imageWidth: 1920,
      imageHeight: 1080,
    });
  });

  it("filters exact current-frame and source-selector matches", () => {
    expect(
      filterAnnotationViews(
        [record],
        { ...filters, currentFrameOnly: true, sourceSelectorKind: "region2d" },
        12,
      ),
    ).toHaveLength(1);
    expect(
      filterAnnotationViews(
        [record],
        { ...filters, currentFrameOnly: true, sourceSelectorKind: "frame" },
        12,
      ),
    ).toHaveLength(0);
    expect(
      filterAnnotationViews([record], { ...filters, currentFrameOnly: true }, 13),
    ).toHaveLength(0);
  });
});
