import { Button } from "@moritzbrantner/ui";
import type { ScenePoint } from "../../types";

type Props = {
  point: ScenePoint | null;
  onSeek: (timeSeconds: number) => void;
};

export function ObservationPanel({ point, onSeek }: Props) {
  return (
    <aside className="observation-panel" aria-labelledby="observation-heading">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Correspondence</p>
          <h2 id="observation-heading">Source observations</h2>
        </div>
      </div>
      {point ? (
        <>
          <div className="point-meta">
            <span>Point {point.id}</span>
            <span>Error {point.reprojectionError.toFixed(3)}</span>
          </div>
          <div className="observation-list">
            {point.observations.length > 0 ? (
              point.observations.map((observation) => (
                <Button key={`${observation.imageId}-${observation.frameIndex}`} onClick={() => onSeek(observation.timeSeconds)}>
                  Frame {observation.frameIndex} · {observation.timeSeconds.toFixed(2)}s
                </Button>
              ))
            ) : (
              <p className="empty-state">This sampled point has no observation mapped to a video frame.</p>
            )}
          </div>
        </>
      ) : (
        <p className="empty-state">Select a sparse 3D point to list the frames that observe it.</p>
      )}
    </aside>
  );
}
