import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { decodeWorkspacePackManifest } from "./t3team-packs.manifest.ts";
import type { LoadedWorkspacePack } from "./t3team-packs.resolve.ts";

export type PackDiscoveryIssue = {
  readonly directory: string;
  readonly message: string;
};

export type PackDiscoveryResult = {
  readonly packs: readonly LoadedWorkspacePack[];
  readonly issues: readonly PackDiscoveryIssue[];
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const loadWorkspacePackDirectory = async (
  directory: string,
): Promise<LoadedWorkspacePack> => {
  const source = await NodeFSP.readFile(NodePath.join(directory, "pack.json"), "utf8");
  return {
    directory,
    manifest: decodeWorkspacePackManifest(JSON.parse(source)),
  };
};

export const discoverLocalWorkspacePacks = async (root: string): Promise<PackDiscoveryResult> => {
  const entries = await NodeFSP.readdir(root, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => NodePath.join(root, entry.name))
    .sort();
  const settled = await Promise.allSettled(directories.map(loadWorkspacePackDirectory));
  const packs: LoadedWorkspacePack[] = [];
  const issues: PackDiscoveryIssue[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") packs.push(result.value);
    else issues.push({ directory: directories[index]!, message: errorMessage(result.reason) });
  });
  return { packs, issues };
};
