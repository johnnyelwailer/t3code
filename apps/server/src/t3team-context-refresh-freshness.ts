import {
  T3TEAM_CONTEXT_AVAILABILITY_FULL,
  T3TEAM_CONTEXT_AVAILABILITY_SUMMARY,
  type T3TeamContextAvailability,
} from "@t3tools/project-context/t3teamContextAvailability";

import { parseT3TeamContextJsonObject } from "./t3team-context-json.ts";

export function readEntryPointAvailability(contents: string): T3TeamContextAvailability {
  const parsed = parseT3TeamContextJsonObject(contents);
  return parsed?.availability === T3TEAM_CONTEXT_AVAILABILITY_FULL
    ? T3TEAM_CONTEXT_AVAILABILITY_FULL
    : T3TEAM_CONTEXT_AVAILABILITY_SUMMARY;
}

export function readManifestSourceUpdatedAt(contents: string): string | undefined {
  const value = parseT3TeamContextJsonObject(contents)?.sourceUpdatedAt;
  return typeof value === "string" ? value : undefined;
}

export function resolveManifestRelativePath(input: {
  readonly ticketEntryPointRelativePath: string;
  readonly fullBundleRootRelativePath?: string;
}): string {
  return input.fullBundleRootRelativePath
    ? `${input.fullBundleRootRelativePath}/manifest.json`
    : input.ticketEntryPointRelativePath.replace(/\/entrypoint\.json$/, "/manifest.json");
}

export function isContextRefreshStale(input: {
  readonly force: boolean;
  readonly availability: T3TeamContextAvailability;
  readonly indexUpdatedAt?: string;
  readonly manifestSourceUpdatedAt?: string;
}): boolean {
  return (
    input.force ||
    input.availability !== T3TEAM_CONTEXT_AVAILABILITY_FULL ||
    (input.indexUpdatedAt !== undefined && input.manifestSourceUpdatedAt !== input.indexUpdatedAt)
  );
}
