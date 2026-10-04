/** Resolve browser-built context JSON paths before the server hashes and persists its mirror. */
import {
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
  toPhysicalProjectStatePath,
} from "@t3tools/project-context/t3teamProjectStateDir";
import type { T3TeamContextFileWrite } from "./t3team-project-workspace-context-files.ts";

function normalizePaths(value: unknown, stateDirName?: string): unknown {
  if (typeof value === "string") {
    // Only whole path values, never a mention embedded in customer text or a URL.
    return /^(?:\.\/)?\.t3team(?:[\\/]|$)|^(?:\/|[A-Za-z]:[\\/])/.test(value)
      ? toPhysicalProjectStatePath(value, stateDirName)
      : value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizePaths(entry, stateDirName));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizePaths(entry, stateDirName)]),
    );
  }
  return value;
}

export function normalizeProjectContextStateFile(
  file: T3TeamContextFileWrite,
  stateDirName: string = PROJECT_STATE_DIR,
): T3TeamContextFileWrite {
  if (stateDirName === T3TEAM_PROJECT_STATE_DIR) return file;
  const relativePath = toPhysicalProjectStatePath(file.relativePath, stateDirName);
  if (file.encoding === "base64" || !relativePath.endsWith(".json")) {
    return { ...file, relativePath };
  }
  try {
    const parsed: unknown = JSON.parse(file.contents);
    return {
      ...file,
      relativePath,
      contents: `${JSON.stringify(normalizePaths(parsed, stateDirName), null, 2)}\n`,
    };
  } catch {
    return { ...file, relativePath };
  }
}
