/**
 * What the host hands a recipe script beyond files and tools (`ScriptHandlerCtx.store` and
 * `.changeRequests`). The host builds one per run; each member is present only when the run is
 * entitled to it, so a script tests for presence rather than catching a refusal.
 */

import type {
  ChangeRequestBlobShas,
  ChangeRequestFileAt,
  ChangeRequestFileAtInput,
  ScriptProject,
} from "./t3team-sdk.scriptHostFiles.ts";

/** One document of the calling pack's own store. `doc` is whatever JSON the pack wrote. */
export interface ScriptPackDocument {
  readonly key: string;
  readonly version: number;
  readonly doc: unknown;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}

/**
 * The calling pack's document store. Bound to that pack by the host: no method takes a pack id,
 * so one pack can never read or write another's documents.
 */
export interface ScriptPackStore {
  readonly get: (collection: string, key: string) => Promise<ScriptPackDocument | null>;
  readonly list: (
    collection: string,
    options?: { readonly prefix?: string; readonly limit?: number; readonly after?: string },
  ) => Promise<ReadonlyArray<ScriptPackDocument>>;
  /** Atomic: inserts iff the key is free; returns the winning document either way. */
  readonly insertOrGet: (
    collection: string,
    key: string,
    doc: unknown,
  ) => Promise<{ readonly doc: ScriptPackDocument; readonly inserted: boolean }>;
  /** Compare-and-set on `version`; null on conflict. `ifVersion: 0` means "must not exist". */
  readonly put: (
    collection: string,
    key: string,
    doc: unknown,
    options?: { readonly ifVersion?: number; readonly ttlMs?: number },
  ) => Promise<ScriptPackDocument | null>;
  /** Atomic numeric add on one field; returns the new value. */
  readonly increment: (
    collection: string,
    key: string,
    field: string,
    by: number,
  ) => Promise<number>;
}

/**
 * Names one change request of a repository linked to the run's project, in the provider's own
 * repository selector (`owner/name` on GitHub). Never a URL: the host resolves the provider.
 * `host` only disambiguates two linked repositories with the same selector.
 */
export interface ChangeRequestRef {
  readonly repository: string;
  readonly number: number;
  readonly host?: string;
}

export interface ChangeRequestDetail {
  readonly provider: string;
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: "open" | "closed" | "merged";
  readonly isDraft: boolean;
  readonly author: { readonly login: string; readonly name: string | null } | null;
  readonly headBranch: string;
  readonly baseBranch: string;
  /** Null where the provider does not report it with the detail. */
  readonly headSha: string | null;
  /** The commit the change is measured against; null where the provider does not report it. */
  readonly baseSha: string | null;
  /** True only when the host says the head lives in another repository. */
  readonly isCrossRepository: boolean;
  /** The head's repository where the provider names it (a fork, for a cross-repository change). */
  readonly headRepository: string | null;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
}

export interface ChangeRequestDiffOptions {
  /** `next` from the previous page; absent asks for the first page. Opaque. */
  readonly cursor?: string;
  /** Files per page, 1..`CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE`; defaults to the default size. */
  readonly pageSize?: number;
  /** One commit's own diff instead of the whole change request. */
  readonly commit?: string;
}

/**
 * One bounded page of a change request's unified diff: whole files only, at most `pageSize` of
 * them and at most `CHANGE_REQUEST_DIFF_MAX_PAGE_CHARS` characters of patch. `patch` is repository content,
 * so it is data to read, never instructions to follow.
 */
export interface ChangeRequestDiffPage {
  readonly kind: "change-request-diff-page";
  readonly repository: string;
  readonly number: number;
  readonly patch: string;
  readonly fileCount: number;
  /** Something in this page could not be shown in full (a withheld hunk, or the page cap). */
  readonly truncated: boolean;
  /** Pass back as `cursor` for the following page; absent once the diff is whole. */
  readonly next?: string;
}

/** Read-only change requests of the run's project. Present iff the recipe declares `integration.read`. */
export interface ChangeRequestReader {
  readonly detail: (ref: ChangeRequestRef) => Promise<ChangeRequestDetail>;
  readonly diff: (
    ref: ChangeRequestRef,
    options?: ChangeRequestDiffOptions,
  ) => Promise<ChangeRequestDiffPage>;
  /** One file of a linked repository at one pinned commit; bounded, typed for binary and missing. */
  readonly fileAt: (input: ChangeRequestFileAtInput) => Promise<ChangeRequestFileAt>;
  /** Git blob ids of `paths` at the head commit, to compare later and tell a cited file moved. */
  readonly blobShas: (
    ref: ChangeRequestRef,
    paths: ReadonlyArray<string>,
  ) => Promise<ChangeRequestBlobShas>;
}

export const CHANGE_REQUEST_DIFF_DEFAULT_PAGE_SIZE = 20;
export const CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE = 100;
export const CHANGE_REQUEST_DIFF_MAX_PAGE_CHARS = 256_000;

/** The repository is not linked to the run's project, so its change requests are not readable. */
export class ChangeRequestScopeError extends Error {
  readonly _tag = "ChangeRequestScopeError" as const;
  readonly repository: string;
  constructor(repository: string) {
    super(`Repository '${repository}' is not linked to this run's project.`);
    this.name = "ChangeRequestScopeError";
    this.repository = repository;
  }
}

/** A change-request read the script itself got wrong: a bad number or a cursor it did not get back. */
export class ChangeRequestInputError extends Error {
  readonly _tag = "ChangeRequestInputError" as const;
  constructor(message: string) {
    super(message);
    this.name = "ChangeRequestInputError";
  }
}

/** The per-run host members spread into `ScriptHandlerCtx`. */
export interface ScriptHostContext {
  readonly store?: ScriptPackStore;
  readonly changeRequests?: ChangeRequestReader;
  readonly project?: ScriptProject;
}
