/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeCrypto from "node:crypto";

import { buildT3TeamProjectProfileManifest } from "@t3tools/t3team-skill-packs";

import { renderAgentsMd } from "./t3team-projectSetupContent.ts";
import {
  renderLegacyAgentsMd,
  renderPreviousAgentsMd,
  renderPreviousAgentsMdOfferFirst,
} from "./t3team-projectSetupAgentsManagedRefresh.ts";
import {
  T3TEAM_PROJECT_SETUP_VERSION,
  type ProjectSetupProfileDefinition,
  type T3TeamProjectSetupFile,
  type T3TeamProjectSetupManagedFileHashes,
  type T3TeamProjectSetupProfileManifest,
} from "./t3team-projectSetupShared.ts";

export type T3TeamProjectSetupPersistedState = {
  readonly profileId?: string;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly managedFileHashes: T3TeamProjectSetupManagedFileHashes;
};

export type T3TeamProjectSetupWriteDecision = {
  readonly shouldWrite: boolean;
  readonly nextManagedHash?: string;
};

export function createT3TeamProjectSetupContentHash(contents: string): string {
  return `sha256:${NodeCrypto.createHash("sha256").update(contents).digest("hex")}`;
}

export function buildT3TeamProjectAgentsManagedRefresh(profile: ProjectSetupProfileDefinition) {
  const currentHash = createT3TeamProjectSetupContentHash(renderAgentsMd(profile));
  const offerFirstHash = createT3TeamProjectSetupContentHash(
    renderPreviousAgentsMdOfferFirst(profile),
  );
  const previousHash = createT3TeamProjectSetupContentHash(renderPreviousAgentsMd(profile));
  const legacyHash = createT3TeamProjectSetupContentHash(renderLegacyAgentsMd(profile));

  return {
    knownContentHashes: [...new Set([legacyHash, previousHash, offerFirstHash, currentHash])],
  };
}

export function buildT3TeamProjectSetupProfileManifest(
  profile: ProjectSetupProfileDefinition,
  input?: {
    readonly enabledSkillPackIds?: ReadonlyArray<string>;
    readonly managedFileHashes?: T3TeamProjectSetupManagedFileHashes;
  },
): T3TeamProjectSetupProfileManifest {
  return buildT3TeamProjectProfileManifest({
    profile,
    enabledSkillPackIds: input?.enabledSkillPackIds ?? [...profile.recommendedSkillPackIds],
    version: T3TEAM_PROJECT_SETUP_VERSION,
    ...(input?.managedFileHashes && Object.keys(input.managedFileHashes).length > 0
      ? { managedFileHashes: input.managedFileHashes }
      : {}),
  });
}

function toManagedFileHashes(value: unknown): T3TeamProjectSetupManagedFileHashes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function readPersistedT3TeamProjectSetupState(
  value: string,
): T3TeamProjectSetupPersistedState {
  try {
    const parsed = JSON.parse(value);
    return {
      profileId: typeof parsed?.profileId === "string" ? parsed.profileId : undefined,
      enabledSkillPackIds: Array.isArray(parsed?.enabledSkillPackIds)
        ? parsed.enabledSkillPackIds.filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
        : undefined,
      managedFileHashes: toManagedFileHashes(parsed?.managedFileHashes),
    };
  } catch {
    return {
      managedFileHashes: {},
    };
  }
}

export function resolveT3TeamProjectSetupWriteDecision(input: {
  readonly file: T3TeamProjectSetupFile;
  readonly currentContents?: string;
  readonly persistedManagedHash?: string;
}): T3TeamProjectSetupWriteDecision {
  const nextManagedHash = input.file.managedRefresh
    ? createT3TeamProjectSetupContentHash(input.file.contents)
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

  const currentHash = createT3TeamProjectSetupContentHash(input.currentContents);
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
