import { createHash } from "node:crypto";

import { renderAgentsMd } from "./t3work-projectSetupContent.ts";
import {
  renderLegacyAgentsMd,
  renderPreviousAgentsMd,
} from "./t3work-projectSetupAgentsManagedRefresh.ts";
import {
  T3WORK_PROJECT_SETUP_VERSION,
  type ProjectSetupProfileDefinition,
  type T3WorkProjectSetupFile,
  type T3WorkProjectSetupManagedFileHashes,
  type T3WorkProjectSetupProfileManifest,
} from "./t3work-projectSetupShared.ts";

export type T3WorkProjectSetupPersistedState = {
  readonly profileId?: string;
  readonly managedFileHashes: T3WorkProjectSetupManagedFileHashes;
};

export type T3WorkProjectSetupWriteDecision = {
  readonly shouldWrite: boolean;
  readonly nextManagedHash?: string;
};

export function createT3WorkProjectSetupContentHash(contents: string): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

export function buildT3WorkProjectAgentsManagedRefresh(profile: ProjectSetupProfileDefinition) {
  const currentHash = createT3WorkProjectSetupContentHash(renderAgentsMd(profile));
  const previousHash = createT3WorkProjectSetupContentHash(renderPreviousAgentsMd(profile));
  const legacyHash = createT3WorkProjectSetupContentHash(renderLegacyAgentsMd(profile));

  return {
    knownContentHashes: [...new Set([legacyHash, previousHash, currentHash])],
  };
}

export function buildT3WorkProjectSetupProfileManifest(
  profile: ProjectSetupProfileDefinition,
  managedFileHashes?: T3WorkProjectSetupManagedFileHashes,
): T3WorkProjectSetupProfileManifest {
  const { id, ...profileFields } = profile;

  return {
    version: T3WORK_PROJECT_SETUP_VERSION,
    profileId: id,
    ...profileFields,
    ...(managedFileHashes && Object.keys(managedFileHashes).length > 0
      ? { managedFileHashes }
      : {}),
  };
}

function toManagedFileHashes(value: unknown): T3WorkProjectSetupManagedFileHashes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function readPersistedT3WorkProjectSetupState(
  value: string,
): T3WorkProjectSetupPersistedState {
  try {
    const parsed = JSON.parse(value);
    return {
      profileId: typeof parsed?.profileId === "string" ? parsed.profileId : undefined,
      managedFileHashes: toManagedFileHashes(parsed?.managedFileHashes),
    };
  } catch {
    return {
      managedFileHashes: {},
    };
  }
}

export function resolveT3WorkProjectSetupWriteDecision(input: {
  readonly file: T3WorkProjectSetupFile;
  readonly currentContents?: string;
  readonly persistedManagedHash?: string;
}): T3WorkProjectSetupWriteDecision {
  const nextManagedHash = input.file.managedRefresh
    ? createT3WorkProjectSetupContentHash(input.file.contents)
    : undefined;

  if (input.file.writeMode === "overwrite") {
    return {
      shouldWrite: true,
      ...(nextManagedHash ? { nextManagedHash } : {}),
    };
  }

  if (typeof input.currentContents !== "string") {
    return {
      shouldWrite: true,
      ...(nextManagedHash ? { nextManagedHash } : {}),
    };
  }

  if (!input.file.managedRefresh || !nextManagedHash) {
    return {
      shouldWrite: false,
    };
  }

  const currentHash = createT3WorkProjectSetupContentHash(input.currentContents);
  if (currentHash === nextManagedHash) {
    return {
      shouldWrite: false,
      nextManagedHash,
    };
  }

  if (
    typeof input.persistedManagedHash === "string" &&
    input.persistedManagedHash === currentHash
  ) {
    return {
      shouldWrite: true,
      nextManagedHash,
    };
  }

  if ((input.file.managedRefresh.knownContentHashes ?? []).includes(currentHash)) {
    return {
      shouldWrite: true,
      nextManagedHash,
    };
  }

  return {
    shouldWrite: false,
  };
}
