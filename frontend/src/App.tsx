import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnnotationInspector } from "./components/AnnotationInspector/AnnotationInspector";
import { MediaPanel } from "./components/MediaPanel/MediaPanel";
import { ProjectHeader } from "./components/ProjectHeader/ProjectHeader";
import { ScenePanel } from "./components/ScenePanel/ScenePanel";
import { annotationAtId, filterAnnotationViews, type AnnotationFilters } from "./lib/annotations";
import {
  createAnnotation,
  deleteAnnotation,
  fetchAnnotations,
  fetchProject,
  updateAnnotation,
} from "./lib/api";
import { frameIndexAtTime, nearestCamera, observationAtFrame, pointById } from "./lib/selection";
import type {
  AnnotationMutation,
  AuthoredSpatialAnnotation,
  Region2d,
  WorkspaceSelection,
} from "./types";

function readFilters(): AnnotationFilters {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source");
  return {
    search: params.get("q") ?? "",
    currentFrameOnly: params.get("frame") === "1",
    kind: params.get("kind") ?? "",
    sourceSelectorKind: source === "frame" || source === "region2d" ? source : "all",
    showSparsePoints: params.get("sparse") !== "0",
  };
}

function writeFilters(filters: AnnotationFilters) {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const setOrDelete = (key: string, value: string) => {
    if (value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  };
  setOrDelete("q", filters.search.trim());
  setOrDelete("kind", filters.kind);
  setOrDelete("source", filters.sourceSelectorKind === "all" ? "" : filters.sourceSelectorKind);
  filters.currentFrameOnly ? params.set("frame", "1") : params.delete("frame");
  filters.showSparsePoints ? params.delete("sparse") : params.set("sparse", "0");
  window.history.replaceState(null, "", url);
}

function errorMessage(value: unknown): string | null {
  return value instanceof Error ? value.message : value ? String(value) : null;
}

export function App() {
  const queryClient = useQueryClient();
  const projectQuery = useQuery({ queryKey: ["project"], queryFn: fetchProject });
  const annotationsQuery = useQuery({ queryKey: ["annotations"], queryFn: fetchAnnotations });
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [selection, setSelection] = useState<WorkspaceSelection>(null);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [associationMode, setAssociationMode] = useState(false);
  const [filters, setFilters] = useState<AnnotationFilters>(readFilters);

  const refreshAnnotations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["annotations"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: createAnnotation,
    onSuccess: (record) => {
      queryClient.setQueryData<AuthoredSpatialAnnotation[]>(["annotations"], (current = []) => [
        ...current,
        record,
      ]);
      setSelection({ kind: "annotation", annotationId: record.annotation.id });
      setAssociationMode(false);
      refreshAnnotations();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, mutation }: { id: string; mutation: AnnotationMutation }) =>
      updateAnnotation(id, mutation),
    onSuccess: (record) => {
      queryClient.setQueryData<AuthoredSpatialAnnotation[]>(["annotations"], (current = []) =>
        current.map((candidate) =>
          candidate.annotation.id === record.annotation.id ? record : candidate,
        ),
      );
      setSelection({ kind: "annotation", annotationId: record.annotation.id });
      setAssociationMode(false);
      refreshAnnotations();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAnnotation,
    onSuccess: (_result, annotationId) => {
      queryClient.setQueryData<AuthoredSpatialAnnotation[]>(["annotations"], (current = []) =>
        current.filter((candidate) => candidate.annotation.id !== annotationId),
      );
      setSelection(null);
      setAssociationMode(false);
      refreshAnnotations();
    },
  });

  useEffect(() => {
    writeFilters(filters);
  }, [filters]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        setAssociationMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const project = projectQuery.data;
  const records = annotationsQuery.data ?? [];
  const activeFrame = project ? frameIndexAtTime(timeSeconds, project.fps) : 0;
  const activeCamera = project ? nearestCamera(project.cameras, activeFrame) : null;
  const visibleAnnotations = useMemo(
    () => filterAnnotationViews(records, filters, activeFrame),
    [activeFrame, filters, records],
  );
  const annotationKinds = useMemo(
    () => [...new Set(records.map((record) => record.annotation.kind))].sort(),
    [records],
  );
  const selectedAnnotation =
    selection?.kind === "annotation" ? annotationAtId(records, selection.annotationId) : null;
  const selectedPointId =
    selection?.kind === "point" ? selection.pointId : (selectedAnnotation?.pointId ?? null);
  const selectedPoint = project ? pointById(project, selectedPointId) : null;
  const selectedObservation = selectedPoint
    ? observationAtFrame(selectedPoint.observations, activeFrame)
    : null;
  const selectedAnnotationId = selection?.kind === "annotation" ? selection.annotationId : null;

  useEffect(() => {
    if (
      selection?.kind === "annotation" &&
      records.some((record) => record.annotation.id === selection.annotationId) &&
      !annotationsQuery.isFetching &&
      !visibleAnnotations.some((annotation) => annotation.id === selection.annotationId)
    ) {
      setSelection(null);
      setAssociationMode(false);
    }
  }, [annotationsQuery.isFetching, records, selection, visibleAnnotations]);

  const handleSeek = useCallback((nextTime: number) => {
    setSeekTime(nextTime);
    setTimeSeconds(nextTime);
  }, []);

  const handleTimeChange = useCallback((time: number) => {
    setTimeSeconds(time);
    setSeekTime(null);
  }, []);

  const handleSelectAnnotation = useCallback(
    (annotationId: string) => {
      const annotation = annotationAtId(records, annotationId);
      setSelection({ kind: "annotation", annotationId });
      setAssociationMode(false);
      if (annotation && project) {
        const nextTime = annotation.frameIndex / project.fps;
        setTimeSeconds(nextTime);
        setSeekTime(nextTime);
      }
    },
    [project, records],
  );

  const handleCreate = useCallback(
    (label: string, note: string) => {
      if (!selectedPoint || selection?.kind !== "point") {
        return;
      }
      createMutation.mutate({
        pointId: selectedPoint.id,
        frameIndex: activeFrame,
        label,
        note,
      });
    },
    [activeFrame, createMutation, selectedPoint, selection],
  );

  const handleUpdate = useCallback(
    (label: string, note: string) => {
      if (!selectedAnnotation) {
        return;
      }
      updateMutation.mutate({
        id: selectedAnnotation.id,
        mutation: {
          pointId: selectedAnnotation.pointId,
          frameIndex: selectedAnnotation.frameIndex,
          label,
          note,
          region: selectedAnnotation.region ?? undefined,
        },
      });
    },
    [selectedAnnotation, updateMutation],
  );

  const handleAssociateRegion = useCallback(
    (region: Region2d) => {
      if (!selectedAnnotation) {
        return;
      }
      updateMutation.mutate({
        id: selectedAnnotation.id,
        mutation: {
          pointId: selectedAnnotation.pointId,
          frameIndex: activeFrame,
          label: selectedAnnotation.label,
          note: selectedAnnotation.note,
          region,
        },
      });
    },
    [activeFrame, selectedAnnotation, updateMutation],
  );

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const mutationError =
    errorMessage(createMutation.error) ??
    errorMessage(updateMutation.error) ??
    errorMessage(deleteMutation.error) ??
    errorMessage(annotationsQuery.error);

  if (projectQuery.isPending) {
    return <main className="loading-shell">Loading spatial project…</main>;
  }
  if (projectQuery.isError || !project) {
    return (
      <main className="loading-shell error-shell">
        <strong>Could not load the spatial project.</strong>
        <span>{errorMessage(projectQuery.error) ?? "Unknown error"}</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ProjectHeader project={project} />
      <section className="annotation-toolbar" aria-label="Annotation filters">
        <label className="toolbar-search">
          <span>Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.currentTarget.value }))
            }
            placeholder="Label, note or kind"
          />
        </label>
        <label>
          <span>Kind</span>
          <select
            value={filters.kind}
            onChange={(event) =>
              setFilters((current) => ({ ...current, kind: event.currentTarget.value }))
            }
          >
            <option value="">All kinds</option>
            {annotationKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Association</span>
          <select
            value={filters.sourceSelectorKind}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sourceSelectorKind: event.currentTarget
                  .value as AnnotationFilters["sourceSelectorKind"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="frame">Frame</option>
            <option value="region2d">Region</option>
          </select>
        </label>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={filters.currentFrameOnly}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                currentFrameOnly: event.currentTarget.checked,
              }))
            }
          />
          <span>Current frame</span>
        </label>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={filters.showSparsePoints}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                showSparsePoints: event.currentTarget.checked,
              }))
            }
          />
          <span>Sparse points</span>
        </label>
        <span className="toolbar-count">{visibleAnnotations.length} annotations</span>
      </section>
      <div className="workspace-grid">
        <MediaPanel
          project={project}
          activeFrame={activeFrame}
          selectedObservation={selectedObservation}
          annotations={visibleAnnotations}
          selectedAnnotationId={selectedAnnotationId}
          associationMode={associationMode}
          onAssociateRegion={handleAssociateRegion}
          onSelectAnnotation={handleSelectAnnotation}
          onTimeChange={handleTimeChange}
          seekTime={seekTime}
        />
        <ScenePanel
          project={project}
          activeCamera={activeCamera}
          selectedPointId={selection?.kind === "point" ? selection.pointId : null}
          annotations={visibleAnnotations}
          selectedAnnotationId={selectedAnnotationId}
          showSparsePoints={filters.showSparsePoints}
          onSelectPoint={(pointId) => {
            setSelection(pointId === null ? null : { kind: "point", pointId });
            setAssociationMode(false);
          }}
          onSelectAnnotation={handleSelectAnnotation}
        />
        <AnnotationInspector
          point={selectedPoint}
          annotation={selectedAnnotation}
          annotations={visibleAnnotations}
          activeFrame={activeFrame}
          busy={busy}
          error={mutationError}
          associationMode={associationMode}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={() => {
            if (selectedAnnotation) {
              deleteMutation.mutate(selectedAnnotation.id);
            }
          }}
          onToggleAssociation={() => setAssociationMode((current) => !current)}
          onSeek={handleSeek}
          onSelectAnnotation={handleSelectAnnotation}
        />
      </div>
    </main>
  );
}
