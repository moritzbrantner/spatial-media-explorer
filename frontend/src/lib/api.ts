import type { AnnotationMutation, AuthoredSpatialAnnotation, ProjectSnapshot } from "../types";

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    let message = `${label} failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchProject(): Promise<ProjectSnapshot> {
  return readJson<ProjectSnapshot>(await fetch("/api/project"), "Project request");
}

export async function fetchAnnotations(): Promise<AuthoredSpatialAnnotation[]> {
  return readJson<AuthoredSpatialAnnotation[]>(
    await fetch("/api/annotations"),
    "Annotation request",
  );
}

export async function createAnnotation(
  mutation: AnnotationMutation,
): Promise<AuthoredSpatialAnnotation> {
  return readJson<AuthoredSpatialAnnotation>(
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    }),
    "Create annotation",
  );
}

export async function updateAnnotation(
  annotationId: string,
  mutation: AnnotationMutation,
): Promise<AuthoredSpatialAnnotation> {
  return readJson<AuthoredSpatialAnnotation>(
    await fetch(`/api/annotations/${encodeURIComponent(annotationId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    }),
    "Update annotation",
  );
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const response = await fetch(`/api/annotations/${encodeURIComponent(annotationId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    let message = `Delete annotation failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(message);
  }
}
