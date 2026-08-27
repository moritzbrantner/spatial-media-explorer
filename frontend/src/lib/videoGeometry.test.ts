import { describe, expect, it } from "vitest";
import { containedMediaRect, mediaSelectionToRegion, regionOverlayRect } from "./videoGeometry";

const closeTo = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe("contained video geometry", () => {
  it("accounts for vertical letterboxing", () => {
    const rect = containedMediaRect(1000, 1000, 1920, 1080);
    expect(rect).not.toBeNull();
    closeTo(rect?.left ?? -1, 0);
    closeTo(rect?.top ?? -1, 218.75);
    closeTo(rect?.width ?? -1, 1000);
    closeTo(rect?.height ?? -1, 562.5);
  });

  it("maps image regions into the contained video rectangle", () => {
    const mediaRect = containedMediaRect(1000, 1000, 1920, 1080);
    expect(mediaRect).not.toBeNull();
    if (!mediaRect) {
      return;
    }
    const overlay = regionOverlayRect(
      {
        x: 960,
        y: 540,
        width: 192,
        height: 108,
        imageWidth: 1920,
        imageHeight: 1080,
      },
      mediaRect,
    );
    expect(overlay).not.toBeNull();
    closeTo(overlay?.left ?? -1, 500);
    closeTo(overlay?.top ?? -1, 500);
    closeTo(overlay?.width ?? -1, 100);
    closeTo(overlay?.height ?? -1, 56.25);
  });

  it("maps a dragged displayed rectangle back into source pixels", () => {
    const mediaRect = containedMediaRect(1000, 1000, 1920, 1080);
    expect(mediaRect).not.toBeNull();
    if (!mediaRect) {
      return;
    }
    const region = mediaSelectionToRegion(
      { left: 500, top: 500, width: 100, height: 56.25 },
      mediaRect,
      1920,
      1080,
    );
    expect(region).not.toBeNull();
    closeTo(region?.x ?? -1, 960);
    closeTo(region?.y ?? -1, 540);
    closeTo(region?.width ?? -1, 192);
    closeTo(region?.height ?? -1, 108);
  });
});
