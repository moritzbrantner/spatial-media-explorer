import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaPanel } from "./components/MediaPanel/MediaPanel";
import { ObservationPanel } from "./components/ObservationPanel/ObservationPanel";
import { ProjectHeader } from "./components/ProjectHeader/ProjectHeader";
import { ScenePanel } from "./components/ScenePanel/ScenePanel";
import { fetchProject } from "./lib/api";
import { frameIndexAtTime, nearestCamera, observationAtFrame, pointById } from "./lib/selection";

export function App() {
  const projectQuery = useQuery({ queryKey: ["project"], queryFn: fetchProject });
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [seekTime, setSeekTime] = useState<number | null>(null);

  const project = projectQuery.data;
  const activeFrame = project ? frameIndexAtTime(timeSeconds, project.fps) : 0;
  const activeCamera = project ? nearestCamera(project.cameras, activeFrame) : null;
  const selectedPoint = project ? pointById(project, selectedPointId) : null;
  const selectedObservation = selectedPoint
    ? observationAtFrame(selectedPoint.observations, activeFrame)
    : null;

  const handleSeek = useCallback((nextTime: number) => {
    setSeekTime(nextTime);
  }, []);

  const handleTimeChange = useCallback((time: number) => {
    setTimeSeconds(time);
    setSeekTime(null);
  }, []);

  if (projectQuery.isPending) {
    return <main className="loading-shell">Loading spatial project…</main>;
  }
  if (projectQuery.isError || !project) {
    return (
      <main className="loading-shell error-shell">
        <strong>Could not load the spatial project.</strong>
        <span>
          {projectQuery.error instanceof Error ? projectQuery.error.message : "Unknown error"}
        </span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ProjectHeader project={project} />
      <div className="workspace-grid">
        <MediaPanel
          project={project}
          activeFrame={activeFrame}
          selectedObservation={selectedObservation}
          onTimeChange={handleTimeChange}
          seekTime={seekTime}
        />
        <ScenePanel
          project={project}
          activeCamera={activeCamera}
          selectedPointId={selectedPointId}
          onSelectPoint={setSelectedPointId}
        />
        <ObservationPanel point={selectedPoint} onSeek={handleSeek} />
      </div>
    </main>
  );
}
