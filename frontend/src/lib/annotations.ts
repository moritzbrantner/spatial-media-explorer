import type {
  AuthoredSpatialAnnotation,
  Region2d,
  Vec3,
} from "../types";

export type AnnotationView = {
  record: AuthoredSpatialAnnotation;
  id: string;
  kind: string;
  label: string;
  note: string;
  frameIndex: number;
  pointId: number;
  position: Vec3;
  region: Region2d | null;
  sourceSelectorKind: string;
  spatialSelectorKind: string;
};

export type AnnotationFilters = {
  search: string;
  currentFrameOnly: boolean;
  sourceSelectorKind: "all" | "frame" | "region_2d";
  showSparsePoints: boolean;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePosition(spatial: unknown): { kind: string; position: Vec3 } | null {
  if (!isObject(spatial) || typeof spatial.kind !== "string") {
    return null;
  }
  if (spatial.kind !== "point3" || !isObject(spatial.point)) {
    return null;
  }
  const x = finiteNumber(spatial.point.x);
  const y = finiteNumber(spatial.point.y);
  const z = finiteNumber(spatial.point.z);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { kind: spatial.kind, position: [x, y, z] };
}

function parseRegion(
  selector: unknown,
  attributes: Record<string, string>,
): { kind: string; region: Region2d | null } {
  if (!isObject(selector) || typeof selector.kind !== "string") {
    return { kind: "unknown", region: null };
  }
  if (selector.kind !== "region_2d") {
    return { kind: selector.kind, region: null };
  }
  const x = finiteNumber(selector.x);
  const y = finiteNumber(selector.y);
  const width = finiteNumber(selector.width);
  const height = finiteNumber(selector.height);
  const imageWidth = parseInteger(attributes.regionImageWidth);
  const imageHeight = parseInteger(attributes.regionImageHeight);
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    imageWidth === null ||
    imageHeight === null
  ) {
    return { kind: selector.kind, region: null };
  }
  return {
    kind: selector.kind,
    region: { x, y, width, height, imageWidth, imageHeight },
  };
}

export function annotationView(record: AuthoredSpatialAnnotation): AnnotationView | null {
  const attributes = record.annotation.attributes ?? {};
  const pointId = parseInteger(attributes.colmapPointId);
  const frameIndex = parseInteger(attributes.frameIndex);
  const spatial = parsePosition(record.binding.spatial);
  if (pointId === null || frameIndex === null || !spatial) {
    return null;
  }
  const source = parseRegion(record.binding.sourceSelector ?? record.annotation.selector, attributes);
  const note =
    record.annotation.value?.type === "text" && typeof record.annotation.value.value === "string"
      ? record.annotation.value.value
      : "";
  return {
    record,
    id: record.annotation.id,
    kind: record.annotation.kind,
    label: record.annotation.label ?? record.annotation.kind,
    note,
    frameIndex,
    pointId,
    position: spatial.position,
    region: source.region,
    sourceSelectorKind: source.kind,
    spatialSelectorKind: spatial.kind,
  };
}

export function filterAnnotationViews(
  records: AuthoredSpatialAnnotation[],
  filters: AnnotationFilters,
  activeFrame: number,
): AnnotationView[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return records
    .map(annotationView)
    .filter((view): view is AnnotationView => view !== null)
    .filter((view) => !filters.currentFrameOnly || view.frameIndex === activeFrame)
    .filter(
      (view) =>
        filters.sourceSelectorKind === "all" ||
        view.sourceSelectorKind === filters.sourceSelectorKind,
    )
    .filter(
      (view) =>
        search.length === 0 ||
        view.label.toLocaleLowerCase().includes(search) ||
        view.note.toLocaleLowerCase().includes(search) ||
        view.kind.toLocaleLowerCase().includes(search),
    );
}

export function annotationAtId(
  records: AuthoredSpatialAnnotation[],
  annotationId: string | null,
): AnnotationView | null {
  if (!annotationId) {
    return null;
  }
  const record = records.find((candidate) => candidate.annotation.id === annotationId);
  return record ? annotationView(record) : null;
}
