/**
 * The `emit` engine verb — typed artifact emission (GHE #292).
 *
 * Same mechanism as the other engine verbs in `t3team-sdk.engineApi.ts` (reads the active body
 * surface from `bodyApiStorage`); it lives in its own module so the engine-API surface list stays
 * under the LOC cap.
 */

import type { ArtifactInput, ArtifactRecord } from "@runbook/core/artifacts";
import { fromRun } from "./t3team-sdk.engineApi.ts";

/**
 * Emit a typed, durable artifact into the run journal (the `artifact` primitive). The returned
 * record is stable across replay — a resumed run reports the same artifact ids it reported before.
 */
export function emit(input: ArtifactInput): Promise<ArtifactRecord> {
  return fromRun<(i: ArtifactInput) => Promise<ArtifactRecord>>("emit")(input);
}
