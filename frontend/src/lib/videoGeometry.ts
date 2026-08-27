import type { Region2d } from "../types";

export type MediaRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function containedMediaRect(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
): MediaRect | null {
  if (
    ![containerWidth, containerHeight, contentWidth, contentHeight].every(Number.isFinite) ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return null;
  }

  const containerAspect = containerWidth / containerHeight;
  const contentAspect = contentWidth / contentHeight;
  if (contentAspect > containerAspect) {
    const width = containerWidth;
    const height = width / contentAspect;
    return {
      left: 0,
      top: (containerHeight - height) / 2,
      width,
      height,
    };
  }

  const height = containerHeight;
  const width = height * contentAspect;
  return {
    left: (containerWidth - width) / 2,
    top: 0,
    width,
    height,
  };
}

export function regionOverlayRect(region: Region2d, mediaRect: MediaRect): MediaRect | null {
  if (
    region.imageWidth <= 0 ||
    region.imageHeight <= 0 ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    return null;
  }

  return {
    left: mediaRect.left + (region.x / region.imageWidth) * mediaRect.width,
    top: mediaRect.top + (region.y / region.imageHeight) * mediaRect.height,
    width: (region.width / region.imageWidth) * mediaRect.width,
    height: (region.height / region.imageHeight) * mediaRect.height,
  };
}

export function mediaSelectionToRegion(
  selection: MediaRect,
  mediaRect: MediaRect,
  imageWidth: number,
  imageHeight: number,
): Region2d | null {
  if (
    ![
      selection.left,
      selection.top,
      selection.width,
      selection.height,
      imageWidth,
      imageHeight,
    ].every(Number.isFinite) ||
    selection.width <= 0 ||
    selection.height <= 0 ||
    mediaRect.width <= 0 ||
    mediaRect.height <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  const left = Math.max(selection.left, mediaRect.left);
  const top = Math.max(selection.top, mediaRect.top);
  const right = Math.min(selection.left + selection.width, mediaRect.left + mediaRect.width);
  const bottom = Math.min(selection.top + selection.height, mediaRect.top + mediaRect.height);
  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: ((left - mediaRect.left) / mediaRect.width) * imageWidth,
    y: ((top - mediaRect.top) / mediaRect.height) * imageHeight,
    width: ((right - left) / mediaRect.width) * imageWidth,
    height: ((bottom - top) / mediaRect.height) * imageHeight,
    imageWidth,
    imageHeight,
  };
}
