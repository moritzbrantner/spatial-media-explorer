import { useEffect, useMemo, useRef } from "react";
import type { PointObservation, ProjectSnapshot } from "../../types";

export type MediaPanelHandle = {
  seek: (timeSeconds: number) => void;
};

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

  useEffect(() => {
    if (seekTime === null || !videoRef.current) {
      return;
    }
    videoRef.current.currentTime = seekTime;
  }, [seekTime]);

  const overlay = useMemo(() => {
    if (!selectedObservation) {
      return null;
    }
    const { region } = selectedObservation;
    return {
      left: `${(region.x / region.imageWidth) * 100}%`,
      top: `${(region.y / region.imageHeight) * 100}%`,
      width: `${(region.width / region.imageWidth) * 100}%`,
      height: `${(region.height / region.imageHeight) * 100}%`,
    };
  }, [selectedObservation]);

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
        source observation in the video.
      </p>
    </section>
  );
}
