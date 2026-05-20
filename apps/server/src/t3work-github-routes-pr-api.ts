import * as Effect from "effect/Effect";

import type { VcsError } from "@t3tools/contracts";

import type { VcsProcessShape } from "./vcs/VcsProcess.ts";

export function encodeRepositoryPath(repository: string): string {
  return repository
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeFilePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toArrayPath(path: string): string {
  return path.includes("?") ? `${path}&per_page=100` : `${path}?per_page=100`;
}

export function extractPullRequestNumber(input: {
  subjectUrl?: string;
  itemId?: string;
}): number | undefined {
  const candidates = [input.subjectUrl, input.itemId].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  for (const candidate of candidates) {
    const apiMatch = candidate.match(/\/pulls\/(\d+)(?:\D|$)/i);
    if (apiMatch) return Number(apiMatch[1]);
    const webMatch = candidate.match(/\/pull\/(\d+)(?:\D|$)/i);
    if (webMatch) return Number(webMatch[1]);
    const itemMatch = candidate.match(/:(\d+)(?:\D|$)/);
    if (itemMatch) return Number(itemMatch[1]);
  }
  return undefined;
}

export function buildContentsPath(input: {
  repository: string;
  path: string;
  ref: string;
}): string {
  return `/repos/${encodeRepositoryPath(input.repository)}/contents/${encodeFilePath(input.path)}?ref=${encodeURIComponent(input.ref)}`;
}

function parseJsonObject<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function parsePaginatedArray<T>(raw: string): ReadonlyArray<T> {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    if (parsed.every((entry) => Array.isArray(entry))) {
      return (parsed as ReadonlyArray<ReadonlyArray<T>>).flat();
    }
    return parsed as ReadonlyArray<T>;
  }
  return [];
}

export function runJsonObject<T>(input: {
  vcs: VcsProcessShape;
  host: string;
  operation: string;
  path: string;
  accept?: string;
  maxOutputBytes?: number;
}): Effect.Effect<T, VcsError, never> {
  const args = ["api", "--hostname", input.host];
  if (input.accept) {
    args.push("-H", `Accept: ${input.accept}`);
  }
  args.push(input.path);
  return input.vcs
    .run({
      operation: input.operation,
      command: "gh",
      args,
      cwd: process.cwd(),
      ...(input.maxOutputBytes ? { maxOutputBytes: input.maxOutputBytes } : {}),
    })
    .pipe(Effect.map((output) => parseJsonObject<T>(output.stdout)));
}

export function runPaginatedArray<T>(input: {
  vcs: VcsProcessShape;
  host: string;
  operation: string;
  path: string;
  accept?: string;
  maxOutputBytes?: number;
}): Effect.Effect<ReadonlyArray<T>, VcsError, never> {
  const args = ["api", "--hostname", input.host, "--paginate", "--slurp"];
  if (input.accept) {
    args.push("-H", `Accept: ${input.accept}`);
  }
  args.push(toArrayPath(input.path));
  return input.vcs
    .run({
      operation: input.operation,
      command: "gh",
      args,
      cwd: process.cwd(),
      ...(input.maxOutputBytes ? { maxOutputBytes: input.maxOutputBytes } : {}),
    })
    .pipe(Effect.map((output) => parsePaginatedArray<T>(output.stdout)));
}

export function runText(input: {
  vcs: VcsProcessShape;
  host: string;
  operation: string;
  path: string;
  accept: string;
  maxOutputBytes?: number;
}): Effect.Effect<string, VcsError, never> {
  const args = ["api", "--hostname", input.host, "-H", `Accept: ${input.accept}`, input.path];
  return input.vcs
    .run({
      operation: input.operation,
      command: "gh",
      args,
      cwd: process.cwd(),
      ...(input.maxOutputBytes ? { maxOutputBytes: input.maxOutputBytes } : {}),
      appendTruncationMarker: true,
    })
    .pipe(Effect.map((output) => output.stdout));
}
