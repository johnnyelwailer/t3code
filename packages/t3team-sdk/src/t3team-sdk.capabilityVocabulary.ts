import type { ToolGroupRef } from "@runbook/tools";

export type { ToolGroupRef } from "@runbook/tools";

/**
 * The tool-group HALF of the one capability vocabulary, as literal ids.
 *
 * Capabilities are expressed in exactly two author-facing places and this file mints NO third one:
 *
 *   • a recipe's `allowedToolGroups` (Epic 16 §Tools — "Keep `allowedToolGroups` as the single
 *     enforcement point"; `docs/t3team-mvp/16-action-recipes.md:1367`), and
 *   • a body's `meta.capabilities` (Epic 25 §Capability gating — a mixed array of engine feature
 *     strings and tool groups; `docs/t3team-mvp/25-workflow-engine.md:687`).
 *
 * Both name the SAME groups. `meta.capabilities` may spell a group as a typed
 * {@link ../t3team-sdk.types.ts#ToolGroupRef} or as its plain group-id string, because imports are
 * blanked in the meta-head vm and a `ToolGroupRef` import cannot survive static meta extraction
 * (see `t3team-sdk.capabilityGating.ts`). `allowedToolGroups` only ever has the string form. So the
 * string form is load-bearing, and until now it was typed `string` everywhere — a misspelled group
 * granted nothing and failed later as "tool is not enabled for this thread", which reads like an
 * engine bug rather than a typo.
 *
 * These are the host-recognised groups. The runtime registry that maps each to concrete catalog
 * tools lives OUTSIDE this package, in `packages/project-recipes/src/toolGroups.ts` — which cannot
 * be imported here (it depends on `@t3team/sdk`, so the arrow only points one way). That registry
 * should `satisfies ReadonlyArray<ToolGroupId>` so the two can never drift; doing so is a one-line
 * change in a package this module is not allowed to reach into.
 */

/** Host tool groups, in the order `packages/project-recipes/src/toolGroups.ts` declares them. */
export const TOOL_GROUP_IDS = [
  "integration.read",
  "view.state",
  "artifact.rw",
  "mutation.draft",
  "thread.handoff",
  "ui.render",
  "sandbox.execute",
] as const;

/**
 * A tool group written as its id string — the form `allowedToolGroups` uses and the form
 * `meta.capabilities` falls back to. A typo is now a compile error instead of a silent no-grant.
 */
export type ToolGroupId = (typeof TOOL_GROUP_IDS)[number];

/** Runtime guard for the string form, for hosts normalizing an untyped wire value. */
export function isToolGroupId(value: string): value is ToolGroupId {
  return (TOOL_GROUP_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * Engine feature strings — the closed set the engine itself owns (Epic 25 §Capability gating).
 * `"schedule"` gates `waitUntil` (Epic 27) at runtime and was missing from this union until now,
 * which is exactly the failure this file exists to stop: a capability the engine enforces but the
 * types do not know about.
 */
export type EngineCapability =
  | "thread"
  | "child"
  | "user"
  | "script"
  | "ui"
  | "workflow"
  | "schedule";

/**
 * A typed reference to a tool group, declared via `defineToolGroup`. Carries the `label` /
 * `description` the pre-execution permission UI renders (Epic 25 §Capability gating).
 */
/**
 * ONE capability, in any of the three forms the surface accepts: an engine feature string, a tool
 * group as a typed ref, or that same group as its id string. This is the vocabulary shared by
 * `meta.capabilities`, a recipe's `allowedToolGroups`, and a child's `capabilities`.
 */
export type WorkflowCapability = EngineCapability | ToolGroupId | ToolGroupRef;

/**
 * A child's capabilities — REQUIRED wherever a workflow creates a subagent (`agent`,
 * `spawnThread`). There is deliberately NO default in either direction:
 *
 *   • defaulting to `"inherit"` silently over-grants — a child quietly gets every mutation group
 *     its parent holds, and nobody writing the call ever decided that;
 *   • defaulting to `[]` silently breaks the child, which then fails mid-turn with a runtime
 *     "tool is not enabled for this thread". That reads like an engine bug rather than like a
 *     choice somebody made, and it is the exact failure mode the `describe-rewrite` recipe hit.
 *
 * So the author states it. `"inherit"` means exactly the parent run's declared `meta.capabilities`;
 * an explicit list must be a SUBSET of the parent's — "Nested orchestrations can declare a subset of
 * the parent's capabilities but never a superset. The engine intersects at invocation."
 * (`docs/t3team-mvp/25-workflow-engine.md:723`).
 */
export type WorkflowChildCapabilities = "inherit" | ReadonlyArray<WorkflowCapability>;
