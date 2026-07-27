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
  const keys = new Set<string>();
  for (const entry of meta.capabilities ?? []) {
    if (typeof entry === "string") keys.add(entry);
    else if (isToolGroupEntry(entry)) keys.add(entry.id);
  }
  return keys;
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

/** The nested-workflow subset rule: a child may never declare beyond its parent. */
export function assertChildCapabilitiesSubset(opts: {
  readonly childName: string;
  readonly childCapabilities: ReadonlySet<string>;
  readonly parentCapabilities: ReadonlySet<string>;
}): void {
  const excess = [...opts.childCapabilities].filter((key) => !opts.parentCapabilities.has(key));
  if (excess.length === 0) return;
  throw new PermissionDeniedError(
    `Nested workflow '${opts.childName}' declares capabilities its parent does not hold: ` +
      `${excess.map((key) => `'${key}'`).join(", ")}. A sub-workflow may declare a subset of ` +
      `the parent's capabilities but never a superset (Epic 25 §Capability gating).`,
  );
}
