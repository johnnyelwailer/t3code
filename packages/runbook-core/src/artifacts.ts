/**
 * Typed artifact emission — the journaled `artifact` primitive.
 *
 * An artifact is a durable, typed output of a run (a report, a diff, a generated file record,
 * …). Emission goes through the run's journal like every other effectful call: the LIVE path
 * mints the record and journals it as the call's result; a REPLAY returns the recorded record
 * verbatim, so a resumed run reports the same artifact ids it reported before. The journal is
 * the artifact store at the core level — hosts that want richer storage mirror the records out
 * (they see them as `kind: "artifact"` journal entries and via
 * {@link import("./status.ts").inspectRun}).
 *
 * The id is minted from HOST entropy, not the journaled `uuid` primitive: the whole record is
 * already journaled as the call's result, so replay stability comes from the journal, and a
 * nested uuid entry would break the journal's crash-recovery prefix invariant (the inner entry
 * would land at seq n+1 before the outer artifact entry at seq n).
 */

import type { PrimitiveCall } from "./runtimeTypes.ts";

/** What a body (or host code) submits when emitting an artifact. */
export interface ArtifactInput {
  /** Host-defined artifact type (e.g. `"report"`, `"diff"`, `"file"`). */
  readonly type: string;
  /** Optional human title. */
  readonly title?: string;
  /** The artifact payload — must be canonical-JSON serializable (it is journaled). */
  readonly data: unknown;
}

/** The durable artifact record; stable across replay. */
export interface ArtifactRecord {
  /** Host-entropy id (NOT journaled — replay stability comes from the journaled record). */
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly data: unknown;
  /** Host-formatted emission timestamp. */
  readonly at: string;
}

export interface ArtifactEmitterDeps {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  /** Host entropy — must NOT be the journaled uuid primitive (see module header). */
  readonly hostUuid: () => string;
  readonly nowIso: () => string;
}

export interface ArtifactEmitter {
  readonly emit: (input: ArtifactInput) => Promise<ArtifactRecord>;
}

/**
 * Build the `emit` surface over a run's primitive seat. One implementation serves both the
 * body-level `emit` global and host-side emission — never copy it.
 */
export function createArtifactEmitter(deps: ArtifactEmitterDeps): ArtifactEmitter {
  const emit = (input: ArtifactInput): Promise<ArtifactRecord> =>
    deps.callPrimitive<ArtifactRecord>({
      kind: "artifact",
      refId: input.type,
      args: input,
      exec: async () => ({
        id: deps.hostUuid(),
        type: input.type,
        ...(input.title === undefined ? {} : { title: input.title }),
        data: input.data,
        at: deps.nowIso(),
      }),
    });
  return { emit };
}
