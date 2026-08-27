import type { ProjectSnapshot } from "../../types";

export function ProjectHeader({ project }: { project: ProjectSnapshot }) {
  return (
    <header className="project-header">
      <div>
        <p className="eyebrow">Spatial Media Explorer</p>
        <h1>{project.videoName}</h1>
      </div>
      <dl className="metrics" aria-label="Project metrics">
        <div>
          <dt>Cameras</dt>
          <dd>{project.cameraCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>
            {project.renderedPointCount.toLocaleString()} / {project.sourcePointCount.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>FPS</dt>
          <dd>{project.fps}</dd>
        </div>
      </dl>
    </header>
  );
}
