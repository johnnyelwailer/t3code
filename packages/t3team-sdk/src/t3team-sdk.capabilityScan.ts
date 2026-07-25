/**
 * Static capability check of a `.workflow.ts` (Epic 25 phase 25.5 — "capability gating at load
 * time"; §Capability gating notes the static lint was previously "out of scope this phase — the
 * runtime gate is the backstop"). Pure AST inspection; the body never runs.
 *
 * ── Mirrors the RUNTIME gates exactly ────────────────────────────────────────
 * The verdicts here must agree with what the engine actually does, or authors get told off for
 * code that runs fine. The live gates are:
 *   • `"script"`   → `scripts.*` is bound at all      (t3team-sdk.bodyRunner.ts)
 *   • `"user"`     → `askUser` / `notifyUser` / `showWidget` on a thread
 *                                                     (t3team-sdk.threadPrimitives.ts)
 *   • `"schedule"` → `waitUntil`                       (t3team-sdk.schedulePrimitive.ts)
 *   • tool group   → `tools.<id>` at its call site     (t3team-sdk.capabilityGating.ts)
 *
 * Everything else — `agent`, `spawnThread`, `askAgent`, `notifyAgent`, `thread`, `workflow()`,
 * `parallel`, `pipeline`, `phase`, `log`, `args`, `budget`, `wait`, `random`, `now`, `uuid`, the
 * error classes — is unconditionally bound (§Capability gating), so it is NOT checked here even
 * where the spec's capability table lists a string for it (`"thread"` / `"child"` / `"ui"` /
 * `"workflow"`): the static verdict follows the implementation, not the table.
 *
 * ── False positives are worse than misses ────────────────────────────────────
 * A `tools.<id>` call is only reported when the id resolves to a REGISTERED `ToolRef` whose group
 * is knowable. An unregistered / recipe-local / dynamically indexed tool is skipped silently.
 * Bare `askUser(…)` (no receiver) is skipped too — the gated verbs only exist as thread members.
 */
import type * as TsApi from "typescript";

import { finding, memberChain, type WorkflowAuditFinding } from "./t3team-sdk.staticAuditTypes.ts";

/** Thread verbs gated by the `"user"` capability, per createThreadPrimitives. */
const USER_VERBS = new Set(["askUser", "notifyUser", "showWidget"]);

export interface CapabilityScanOptions {
  /** Normalized `meta.capabilities` (see normalizeCapabilities). */
  readonly declared: ReadonlySet<string>;
  /** Resolve a dotted tool id to its group id; `undefined` when the tool is unknown. */
  readonly resolveToolGroupId?: (toolId: string) => string | undefined;
}

function missing(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  node: TsApi.Node,
  capability: string,
  what: string,
): WorkflowAuditFinding {
  return finding(ts, sf, node, {
    facet: "capability",
    rule: "missing-capability",
    message:
      `${what} requires the '${capability}' capability, which this workflow's meta.capabilities ` +
      `does not declare. Add '${capability}' to meta.capabilities, or drop the call — at run time ` +
      `the engine raises PermissionDeniedError at this call site.`,
  });
}

/** `scripts.<name>` anywhere in the body requires `"script"` (the whole tree is unbound without it). */
function scanScriptRefs(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  declared: ReadonlySet<string>,
  into: WorkflowAuditFinding[],
): void {
  if (declared.has("script")) return;
  const visit = (node: TsApi.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = memberChain(ts, node);
      if (chain !== null && chain.root === "scripts" && chain.path.length > 0) {
        into.push(missing(ts, sf, node, "script", `\`scripts.${chain.path.join(".")}\``));
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Gated thread verbs + `waitUntil` + `tools.*` call sites. */
function scanCallSites(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  options: CapabilityScanOptions,
  into: WorkflowAuditFinding[],
): void {
  const { declared } = options;
  const visit = (node: TsApi.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "waitUntil" && !declared.has("schedule")) {
        into.push(missing(ts, sf, node, "schedule", "`waitUntil(…)`"));
      } else if (ts.isPropertyAccessExpression(callee)) {
        const verb = callee.name.text;
        if (USER_VERBS.has(verb) && !declared.has("user")) {
          into.push(missing(ts, sf, callee, "user", `\`${verb}(…)\``));
        } else {
          const chain = memberChain(ts, callee);
          if (chain !== null && chain.root === "tools" && chain.path.length > 0) {
            const toolId = chain.path.join(".");
            const groupId = options.resolveToolGroupId?.(toolId);
            // Unknown tool → the group is unknowable statically; stay silent (miss > false alarm).
            if (groupId !== undefined && !declared.has(groupId)) {
              into.push(missing(ts, sf, callee, groupId, `\`tools.${toolId}(…)\``));
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Run every static capability rule over an already-parsed workflow source file. */
export function scanCapabilities(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  options: CapabilityScanOptions,
): ReadonlyArray<WorkflowAuditFinding> {
  const findings: WorkflowAuditFinding[] = [];
  scanScriptRefs(ts, sf, options.declared, findings);
  scanCallSites(ts, sf, options, findings);
  return findings;
}
