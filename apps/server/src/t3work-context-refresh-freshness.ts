import {
  T3WORK_CONTEXT_AVAILABILITY_FULL,
  T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
  type T3workContextAvailability,
} from "@t3tools/project-context/t3workContextAvailability";

import { parseT3workContextJsonObject } from "./t3work-context-json.ts";

export function readEntryPointAvailability(contents: string): T3workContextAvailability {
  const parsed = parseT3workContextJsonObject(contents);
  return parsed?.availability === T3WORK_CONTEXT_AVAILABILITY_FULL
    ? T3WORK_CONTEXT_AVAILABILITY_FULL
    : T3WORK_CONTEXT_AVAILABILITY_SUMMARY;
}

export function readManifestSourceUpdatedAt(contents: string): string | undefined {
  const value = parseT3workContextJsonObject(contents)?.sourceUpdatedAt;
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
  readonly availability: T3workContextAvailability;
  readonly indexUpdatedAt?: string;
  readonly manifestSourceUpdatedAt?: string;
}): boolean {
  return (
    input.force ||
    input.availability !== T3WORK_CONTEXT_AVAILABILITY_FULL ||
    (input.indexUpdatedAt !== undefined && input.manifestSourceUpdatedAt !== input.indexUpdatedAt)
  );
}
