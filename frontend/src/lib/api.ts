import type { ProjectSnapshot } from "../types";

export async function fetchProject(): Promise<ProjectSnapshot> {
  const response = await fetch("/api/project");
  if (!response.ok) {
    throw new Error(`Project request failed with ${response.status}`);
  }
  return (await response.json()) as ProjectSnapshot;
}
