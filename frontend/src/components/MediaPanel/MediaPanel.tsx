import { useEffect, useMemo, useRef, useState } from "react";
import { containedMediaRect, regionOverlayRect, type MediaRect } from "../../lib/videoGeometry";
import type { PointObservation, ProjectSnapshot } from "../../types";

type Props = {
  project: ProjectSnapshot;
  activeFrame: number;
  selectedObservation: PointObservation | null;
  onTimeChange: (timeSeconds: number) => void;
  seekTime: number | null;
};

export function MediaPanel({
  project,
  activeFrame,
  selectedObservation,
  onTimeChange,
  seekTime,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaRect, setMediaRect] = useState<MediaRect | null>(null);

  useEffect(() => {
    if (seekTime === null || !videoRef.current) {
      return;
    }
    videoRef.current.currentTime = seekTime;
  }, [seekTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateMediaRect = () => {
      setMediaRect(
        containedMediaRect(video.clientWidth, video.clientHeight, video.videoWidth, video.videoHeight),
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

  const overlay = useMemo(() => {
    if (!selectedObservation || selectedObservation.frameIndex !== activeFrame || !mediaRect) {
      return null;
    }
    return regionOverlayRect(selectedObservation.region, mediaRect);
  }, [activeFrame, mediaRect, selectedObservation]);

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
          controls
          preload="metadata"
          onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
        />
        {overlay ? <div className="region-overlay" style={overlay} aria-hidden="true" /> : null}
      </div>
      <p className="panel-help">
        Playback follows the nearest reconstructed COLMAP camera. Selecting a 3D point reveals its
        source observation only on frames that actually observe that point.
      </p>
    </section>
  );
}
