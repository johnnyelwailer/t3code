import type {
  WorkspacePackLock,
  WorkspacePackManifest,
  WorkspacePackScope,
} from "./t3work-packs.manifest.ts";

export const packScopeOrder: Readonly<Record<WorkspacePackScope, number>> = {
  distribution: 1,
  global: 2,
  user: 3,
  project: 4,
  "remote-managed": 5,
};

export type LoadedWorkspacePack = {
  readonly directory: string;
  readonly manifest: WorkspacePackManifest;
};

export type ResolvedPackLock = WorkspacePackLock & {
  readonly source: {
    readonly id: string;
    readonly version: string;
    readonly scope: WorkspacePackScope;
  };
};

export type WorkspacePackResolution = {
  readonly packs: readonly LoadedWorkspacePack[];
  readonly locks: Readonly<Record<string, ResolvedPackLock>>;
  readonly diagnostics: readonly string[];
};

const scopeOf = (pack: LoadedWorkspacePack): WorkspacePackScope =>
  pack.manifest.scope ?? "distribution";

const comparePacks = (left: LoadedWorkspacePack, right: LoadedWorkspacePack): number =>
  packScopeOrder[scopeOf(left)] - packScopeOrder[scopeOf(right)] ||
  left.manifest.id.localeCompare(right.manifest.id) ||
  left.manifest.version.localeCompare(right.manifest.version) ||
  left.directory.localeCompare(right.directory);

export const resolveWorkspacePacks = (
  discovered: readonly LoadedWorkspacePack[],
): WorkspacePackResolution => {
  const diagnostics: string[] = [];
  const selected = new Map<string, LoadedWorkspacePack>();

  for (const pack of [...discovered].sort(comparePacks)) {
    const previous = selected.get(pack.manifest.id);
    if (previous) {
      diagnostics.push(
        `Pack ${pack.manifest.id}@${previous.manifest.version} replaced by ${pack.manifest.id}@${pack.manifest.version} (${scopeOf(pack)}).`,
      );
    }
    selected.set(pack.manifest.id, pack);
  }

  const packs = [...selected.values()].sort(comparePacks);
  const locks: Record<string, ResolvedPackLock> = {};
  for (const pack of packs) {
    for (const lock of pack.manifest.locks ?? []) {
      const previous = locks[lock.target];
      locks[lock.target] = {
        ...lock,
        source: {
          id: pack.manifest.id,
          version: pack.manifest.version,
          scope: scopeOf(pack),
        },
      };
      diagnostics.push(
        previous
          ? `Lock ${lock.target} from ${previous.source.id}@${previous.source.version} replaced by ${pack.manifest.id}@${pack.manifest.version}.`
          : `Lock ${lock.target} set by ${pack.manifest.id}@${pack.manifest.version}.`,
      );
    }
  }

  return { packs, locks, diagnostics };
};
