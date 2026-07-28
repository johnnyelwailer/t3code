/**
 * Capability gating helpers (Epic 25 §Capability gating).
 *
 * `meta.capabilities` is a mixed array of engine feature strings ("user", "script", …)
 * and tool-group declarations. Typed `ToolGroupRef` imports cannot survive the static
 * meta extraction (imports are blanked in the meta-head vm — see t3team-sdk.loader.ts),
 * so a group may be declared either as an inline `{ kind: "tool-group", id, … }` literal
 * or as its plain group-id string (e.g. `"github.read"`). Both normalize to the group id.
 *
 * Two runtime gates live here:
 *   • `assertToolGroupDeclared` — the `tools.*` call-site gate: the ToolRef's `group` is
 *     checked against the declared set; missing → `PermissionDeniedError` (spec §Tools:
 *     "The ref's `group` is checked against `meta.capabilities` at the call site").
 *   • `assertChildCapabilitiesSubset` — the nested-workflow rule (spec §Capability
 *     gating: "Nested workflows can declare a subset of the parent's capabilities but
 *     never a superset. The engine intersects at invocation."): a child declaring
 *     anything the parent does not hold fails at invocation, so the effective child set
 *     (declared ∩ parent) always equals what the child declared.
 */

import type { WorkflowChildCapabilities } from "./t3team-sdk.capabilityVocabulary.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { WorkflowMeta } from "./t3team-sdk.loader.ts";

/** A `ToolGroupRef`-shaped capability entry that survived meta extraction as a literal. */
function isToolGroupEntry(entry: unknown): entry is { readonly id: string } {
  return (
    typeof entry === "object" &&
    entry !== null &&
    (entry as { kind?: unknown }).kind === "tool-group" &&
    typeof (entry as { id?: unknown }).id === "string"
  );
}

/**
 * Normalize `meta.capabilities` into one flat set of capability keys: engine feature
 * strings stay as-is; tool-group entries (literal objects or plain group-id strings)
 * contribute their group id. Engine feature strings and group ids share one namespace
 * here — group ids are dotted (`"github.read"`), engine strings are not, so they cannot
 * collide.
 */
export function normalizeCapabilities(meta: WorkflowMeta): ReadonlySet<string> {
  return normalizeCapabilityEntries(meta.capabilities ?? []);
}

/** The same normalization for a capability array that did not come from `meta` — a child's
 * declared `capabilities`, or a host-supplied grant. */
export function normalizeCapabilityEntries(entries: ReadonlyArray<unknown>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (typeof entry === "string") keys.add(entry);
    else if (isToolGroupEntry(entry)) keys.add(entry.id);
  }
  return keys;
}

/**
 * Resolve a subagent's declared `capabilities` against the parent run's, and enforce the subset
 * rule while doing it (spec §Capability gating, `docs/t3team-mvp/25-workflow-engine.md:723`).
 *
 * `"inherit"` resolves to the parent's set verbatim. An explicit list is checked, so a child asking
 * for a group the parent does not hold fails HERE — at the spawn — rather than three turns later
 * when the child's tool call is refused by the host.
 */
export function resolveChildCapabilities(opts: {
  /**
   * Typed as required on `agent` / `spawnThread`, but `undefined` is REACHABLE, and not only for
   * third-party code: a body is loaded and transpiled from disk at run time, and NO `.workflow.ts`
   * in this repo is inside a typecheck program (`packages/t3team-sdk/tsconfig.json` excludes
   * `src/__fixtures__`; `apps/server/tsconfig.json` includes only `src`), while a user's authored
   * workflow has no tsconfig at all. So for every workflow that actually runs, THIS is the gate —
   * the type only protects code compiled in a package. Hence a sentence naming the fix, not a
   * `TypeError: undefined is not iterable`.
   */
  readonly declared: WorkflowChildCapabilities | undefined;
  readonly parent: ReadonlySet<string>;
  readonly childLabel: string;
}): ReadonlyArray<string> {
  if (opts.declared === undefined) {
    throw new PermissionDeniedError(
      `Subagent '${opts.childLabel}' was created without \`capabilities\`, which is required. ` +
        `Pass \`capabilities: "inherit"\` to give it exactly this workflow's own grant, or an ` +
        `explicit subset such as \`capabilities: ["integration.read"]\`. There is deliberately no ` +
        `default: inheriting silently over-grants, and an empty grant silently breaks the child.`,
    );
  }
  if (opts.declared === "inherit") return [...opts.parent];
  const childCapabilities = normalizeCapabilityEntries(opts.declared);
  assertChildCapabilitiesSubset({
    childName: opts.childLabel,
    childCapabilities,
    parentCapabilities: opts.parent,
    childKind: "thread",
  });
  return [...childCapabilities];
}

/** The `tools.*` call-site gate: throw unless the tool's group is declared. */
export function assertToolGroupDeclared(
  tool: { readonly id: string; readonly group: { readonly id: string; readonly label: string } },
  declared: ReadonlySet<string>,
): void {
  if (declared.has(tool.group.id)) return;
  throw new PermissionDeniedError(
    `Tool '${tool.id}' requires the '${tool.group.id}' tool-group capability (${tool.group.label}). ` +
      `Add the group to this workflow's meta.capabilities.`,
  );
}

/** The nested-child subset rule: a child may never declare beyond its parent. Shared by
 * sub-workflow invocation and by subagent creation (`agent` / `spawnThread`). */
export function assertChildCapabilitiesSubset(opts: {
  readonly childName: string;
  readonly childCapabilities: ReadonlySet<string>;
  readonly parentCapabilities: ReadonlySet<string>;
  /** Noun for the message; "workflow" for `workflow()`, "thread" for a spawned subagent. */
  readonly childKind?: string;
}): void {
  const excess = [...opts.childCapabilities].filter((key) => !opts.parentCapabilities.has(key));
  if (excess.length === 0) return;
  throw new PermissionDeniedError(
    `Nested ${opts.childKind ?? "workflow"} '${opts.childName}' declares capabilities its parent does not hold: ` +
      `${excess.map((key) => `'${key}'`).join(", ")}. A sub-workflow may declare a subset of ` +
      `the parent's capabilities but never a superset (Epic 25 §Capability gating).`,
  );
}
