import { useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationView } from "../../lib/annotations";
import {
  containedMediaRect,
  mediaSelectionToRegion,
  regionOverlayRect,
  type MediaRect,
} from "../../lib/videoGeometry";
import type { PointObservation, ProjectSnapshot, Region2d } from "../../types";

type Props = {
  project: ProjectSnapshot;
  activeFrame: number;
  selectedObservation: PointObservation | null;
  annotations: AnnotationView[];
  selectedAnnotationId: string | null;
  associationMode: boolean;
  onAssociateRegion: (region: Region2d) => void;
  onSelectAnnotation: (annotationId: string) => void;
  onTimeChange: (timeSeconds: number) => void;
  seekTime: number | null;
};

type DragPoint = { x: number; y: number };

export function MediaPanel({
  project,
  activeFrame,
  selectedObservation,
  annotations,
  selectedAnnotationId,
  associationMode,
  onAssociateRegion,
  onSelectAnnotation,
  onTimeChange,
  seekTime,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaRect, setMediaRect] = useState<MediaRect | null>(null);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null);

  useEffect(() => {
    if (seekTime === null || !videoRef.current) {
      return;
    }
    videoRef.current.currentTime = seekTime;
  }, [seekTime]);

  useEffect(() => {
    if (associationMode) {
      videoRef.current?.pause();
      return;
    }
    setDragStart(null);
    setDragCurrent(null);
  }, [associationMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateMediaRect = () => {
      setMediaRect(
        containedMediaRect(
          video.clientWidth,
          video.clientHeight,
          video.videoWidth,
          video.videoHeight,
        ),
      );
    };
    updateMediaRect();
    video.addEventListener("loadedmetadata", updateMediaRect);
    const observer = new ResizeObserver(updateMediaRect);
    observer.observe(video);

    return () => {
      video.removeEventListener("loadedmetadata", updateMediaRect);
      observer.disconnect();
    };
  }, [project.videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (
      !video ||
      typeof video.requestVideoFrameCallback !== "function" ||
      typeof video.cancelVideoFrameCallback !== "function"
    ) {
      return;
    }

    let callbackId: number | null = null;
    let active = true;
    const syncPresentedFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (!active) {
        return;
      }
      onTimeChange(metadata.mediaTime);
      callbackId = video.requestVideoFrameCallback(syncPresentedFrame);
    };

    callbackId = video.requestVideoFrameCallback(syncPresentedFrame);
    return () => {
      active = false;
      if (callbackId !== null) {
        video.cancelVideoFrameCallback(callbackId);
      }
    };
  }, [onTimeChange, project.videoUrl]);

  const observationOverlay = useMemo(() => {
    if (!selectedObservation || selectedObservation.frameIndex !== activeFrame || !mediaRect) {
      return null;
    }
    return regionOverlayRect(selectedObservation.region, mediaRect);
  }, [activeFrame, mediaRect, selectedObservation]);

  const annotationOverlays = useMemo(() => {
    if (!mediaRect) {
      return [];
    }
    return annotations.flatMap((annotation) => {
      if (annotation.frameIndex !== activeFrame || !annotation.region) {
        return [];
      }
      const rect = regionOverlayRect(annotation.region, mediaRect);
      return rect ? [{ annotation, rect }] : [];
    });
  }, [activeFrame, annotations, mediaRect]);

  const dragRect = useMemo<MediaRect | null>(() => {
    if (!dragStart || !dragCurrent) {
      return null;
    }
    return {
      left: Math.min(dragStart.x, dragCurrent.x),
      top: Math.min(dragStart.y, dragCurrent.y),
      width: Math.abs(dragCurrent.x - dragStart.x),
      height: Math.abs(dragCurrent.y - dragStart.y),
    };
  }, [dragCurrent, dragStart]);

  return (
    <section className="workspace-panel media-panel" aria-labelledby="media-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source media</p>
          <h2 id="media-heading">Video</h2>
        </div>
        <span className="frame-pill">Frame {activeFrame}</span>
      </div>
      <div className="video-stage">
        <video
          ref={videoRef}
          src={project.videoUrl}
          controls={!associationMode}
          preload="metadata"
          onTimeUpdate={(event) => {
            if (typeof event.currentTarget.requestVideoFrameCallback !== "function") {
              onTimeChange(event.currentTarget.currentTime);
            }
          }}
        />
        {observationOverlay ? (
          <div
            className="region-overlay reconstructed-region"
            style={observationOverlay}
            aria-hidden="true"
          />
        ) : null}
        {annotationOverlays.map(({ annotation, rect }) => (
          <button
            key={annotation.id}
            type="button"
            className={`authored-region-overlay${annotation.id === selectedAnnotationId ? " selected" : ""}`}
            style={rect}
            aria-label={`Select annotation ${annotation.label}`}
            onClick={() => onSelectAnnotation(annotation.id)}
          />
        ))}
        {associationMode ? (
          <div
            className="association-layer"
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragStart(point);
              setDragCurrent(point);
            }}
            onPointerMove={(event) => {
              if (!dragStart) {
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setDragCurrent({ x: event.clientX - rect.left, y: event.clientY - rect.top });
            }}
            onPointerUp={(event) => {
              if (!dragRect || !mediaRect || !videoRef.current) {
                setDragStart(null);
                setDragCurrent(null);
                return;
              }
              const region = mediaSelectionToRegion(
                dragRect,
                mediaRect,
                videoRef.current.videoWidth,
                videoRef.current.videoHeight,
              );
              setDragStart(null);
              setDragCurrent(null);
              if (region && region.width >= 2 && region.height >= 2) {
                onAssociateRegion(region);
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            {dragRect ? <div className="region-selection" style={dragRect} /> : null}
          </div>
        ) : null}
      </div>
      <p className="panel-help">
        {associationMode
          ? "Drag over the paused source media to bind a pixel region to the selected 3D annotation."
          : "Playback follows the nearest reconstructed COLMAP camera. Authored regions and reconstructed observations remain independently selectable."}
      </p>
    </section>
  );
}
