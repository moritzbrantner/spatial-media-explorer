import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@moritzbrantner/ui";
import type { AnnotationView } from "../../lib/annotations";
import type { ScenePoint } from "../../types";

type Props = {
  point: ScenePoint | null;
  annotation: AnnotationView | null;
  annotations: AnnotationView[];
  activeFrame: number;
  busy: boolean;
  error: string | null;
  associationMode: boolean;
  onCreate: (label: string, note: string) => void;
  onUpdate: (label: string, note: string) => void;
  onDelete: () => void;
  onToggleAssociation: () => void;
  onSeek: (timeSeconds: number) => void;
  onSelectAnnotation: (annotationId: string) => void;
};

export function AnnotationInspector({
  point,
  annotation,
  annotations,
  activeFrame,
  busy,
  error,
  associationMode,
  onCreate,
  onUpdate,
  onDelete,
  onToggleAssociation,
  onSeek,
  onSelectAnnotation,
}: Props) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setLabel(annotation?.label ?? "");
    setNote(annotation?.note ?? "");
  }, [annotation]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (annotation) {
      onUpdate(label, note);
    } else {
      onCreate(label, note);
    }
  };

  return (
    <aside className="observation-panel annotation-inspector" aria-labelledby="inspector-heading">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Selection</p>
          <h2 id="inspector-heading">Annotation inspector</h2>
        </div>
      </div>

      {point ? (
        <>
          <div className="point-meta">
            <span>Point {point.id}</span>
            <span>Frame {activeFrame}</span>
          </div>
          <form className="annotation-form" onSubmit={submit}>
            <label>
              <span>Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.currentTarget.value)}
                placeholder="door, person, sign…"
                required
              />
            </label>
            <label>
              <span>Note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="Optional description"
                rows={3}
              />
            </label>
            <div className="annotation-actions">
              <Button type="submit" disabled={busy || label.trim().length === 0}>
                {annotation ? "Save annotation" : "Create annotation"}
              </Button>
              {annotation ? (
                <>
                  <Button type="button" disabled={busy} onClick={onToggleAssociation}>
                    {associationMode ? "Cancel region" : "Associate region"}
                  </Button>
                  <Button type="button" disabled={busy} onClick={onDelete}>
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </form>
          {annotation ? (
            <div className="annotation-summary">
              <span>Kind {annotation.kind}</span>
              <span>
                {annotation.region
                  ? `${annotation.region.width.toFixed(0)}×${annotation.region.height.toFixed(0)} px region`
                  : "Frame association"}
              </span>
            </div>
          ) : null}
          {associationMode ? (
            <p className="association-hint">
              Drag a rectangle over the paused video to associate it.
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}

          <div className="inspector-section">
            <p className="eyebrow">COLMAP observations</p>
            <div className="observation-list">
              {point.observations.length > 0 ? (
                point.observations.map((observation) => (
                  <Button
                    key={`${observation.imageId}-${observation.frameIndex}`}
                    onClick={() => onSeek(observation.timeSeconds)}
                  >
                    Frame {observation.frameIndex} · {observation.timeSeconds.toFixed(2)}s
                  </Button>
                ))
              ) : (
                <p className="empty-state">No mapped source observations for this point.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="empty-state">
          Select a sparse 3D point to create an annotation, or choose an authored annotation below.
        </p>
      )}

      <div className="inspector-section annotation-browser">
        <p className="eyebrow">Visible annotations</p>
        <div className="observation-list">
          {annotations.length > 0 ? (
            annotations.map((candidate) => (
              <Button key={candidate.id} onClick={() => onSelectAnnotation(candidate.id)}>
                {candidate.label} · frame {candidate.frameIndex}
              </Button>
            ))
          ) : (
            <p className="empty-state">No annotations match the current filters.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
