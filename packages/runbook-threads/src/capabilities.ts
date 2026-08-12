/** Generic child-capability algebra. Hosts may specialize the capability type at their adapter boundary. */

import { PermissionDeniedError } from "@runbook/core/errors";

export interface ToolGroupCapability {
  readonly kind: "tool-group";
  readonly id: string;
  readonly [key: string]: unknown;
}

export type WorkflowCapability = string | ToolGroupCapability;
export type WorkflowChildCapabilities = "inherit" | ReadonlyArray<WorkflowCapability>;

function isToolGroupEntry(entry: unknown): entry is ToolGroupCapability {
  return (
    typeof entry === "object" &&
    entry !== null &&
    (entry as { kind?: unknown }).kind === "tool-group" &&
    typeof (entry as { id?: unknown }).id === "string"
  );
}

export function normalizeCapabilityEntries(entries: ReadonlyArray<unknown>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (typeof entry === "string") keys.add(entry);
    else if (isToolGroupEntry(entry)) keys.add(entry.id);
  }
  return keys;
}

export function resolveChildCapabilities(opts: {
  readonly declared: unknown;
  readonly parent: ReadonlySet<string>;
  readonly childLabel: string;
}): ReadonlyArray<string> {
  if (opts.declared === undefined) {
    throw new PermissionDeniedError(
      "Subagent '" +
        opts.childLabel +
        "' was created without `capabilities`, which is required. " +
        'Pass `capabilities: "inherit"` to give it exactly this workflow\'s own grant, or an ' +
        'explicit subset such as `capabilities: ["integration.read"]`. There is deliberately no ' +
        "default: inheriting silently over-grants, and an empty grant silently breaks the child.",
    );
  }
  if (opts.declared === "inherit") return [...opts.parent];
  if (!Array.isArray(opts.declared)) {
    throw new PermissionDeniedError(
      "Subagent '" +
        opts.childLabel +
        "' was created with an invalid `capabilities` value (" +
        typeof opts.declared +
        ": " +
        JSON.stringify(opts.declared) +
        "). " +
        'Pass `capabilities: "inherit"` to give it exactly this workflow\'s own grant, or an ' +
        'explicit array such as `capabilities: ["integration.read"]`. There is deliberately no ' +
        "coercion: a non-array grant is rejected rather than silently treated as empty, which " +
        "would silently break the child.",
    );
  }
  const childCapabilities = normalizeCapabilityEntries(opts.declared);
  assertChildCapabilitiesSubset({
    childName: opts.childLabel,
    childCapabilities,
    parentCapabilities: opts.parent,
    childKind: "thread",
  });
  return [...childCapabilities];
}

export function assertToolGroupDeclared(
  tool: { readonly id: string; readonly group: { readonly id: string; readonly label: string } },
  declared: ReadonlySet<string>,
): void {
  if (declared.has(tool.group.id)) return;
  throw new PermissionDeniedError(
    "Tool '" +
      tool.id +
      "' requires the '" +
      tool.group.id +
      "' tool-group capability (" +
      tool.group.label +
      "). " +
      "Add the group to this workflow's meta.capabilities.",
  );
}

/**
 * Layer-escalation trust gate (the runbook cascade's "layer 3 cannot grant
 * itself new capabilities" rule): a project-layer runbook may only declare
 * capabilities its inherited base runbook already had. No-ops for any other
 * layer — layers 1-2 (defaults/catalog) are trusted, reviewed content and
 * may declare whatever they want. Delegates the actual subset check to
 * {@link assertChildCapabilitiesSubset} rather than duplicating the
 * set-difference logic.
 */
export function assertNoLayerCapabilityEscalation(opts: {
  readonly runbookName: string;
  readonly layer: string | undefined;
  readonly baseCapabilities: ReadonlySet<string>;
  readonly declaredCapabilities: ReadonlySet<string>;
}): void {
  if (opts.layer !== "project") return;
  assertChildCapabilitiesSubset({
    childName: opts.runbookName,
    childCapabilities: opts.declaredCapabilities,
    parentCapabilities: opts.baseCapabilities,
    childKind: "project-layer runbook",
  });
}

export function assertChildCapabilitiesSubset(opts: {
  readonly childName: string;
  readonly childCapabilities: ReadonlySet<string>;
  readonly parentCapabilities: ReadonlySet<string>;
  readonly childKind?: string;
}): void {
  const excess = [...opts.childCapabilities].filter((key) => !opts.parentCapabilities.has(key));
  if (excess.length === 0) return;
  throw new PermissionDeniedError(
    "Nested " +
      (opts.childKind ?? "workflow") +
      " '" +
      opts.childName +
      "' declares capabilities its parent does not hold: " +
      excess.map((key) => "'" + key + "'").join(", ") +
      ". A sub-workflow may declare a subset of " +
      "the parent's capabilities but never a superset (Epic 25 §Capability gating).",
  );
}
