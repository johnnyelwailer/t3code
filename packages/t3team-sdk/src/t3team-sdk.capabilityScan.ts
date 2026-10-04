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
 *   • `"source:<name>"` → `getSignalSource(<built-in source>)` (t3team-sdk.signalPrimitive.ts)
 *                    and `watermark("<name>")`        (t3team-sdk.watermarkPrimitive.ts)
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

import { BUILTIN_SIGNAL_GLOBALS } from "./t3team-sdk.builtinSignals.ts";
import { finding, memberChain, type WorkflowAuditFinding } from "./t3team-sdk.staticAuditTypes.ts";
import {
  collectWorkflowBodyBindings,
  resolveVerb,
  type WorkflowBodyBindings,
} from "./t3team-sdk.workflowShapeBindings.ts";

/** Thread verbs gated by the `"user"` capability, per createThreadPrimitives. */
const USER_VERBS = new Set(["askUser", "notifyUser", "showWidget"]);

/** Built-in source declaration export name → source name (`ScmChangeRequestWatch` → `scm.…`). */
const BUILTIN_SOURCE_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(BUILTIN_SIGNAL_GLOBALS).flatMap(([exportName, value]) => {
    const ref = value as { readonly kind?: unknown; readonly name?: unknown };
    return ref.kind === "signalSource" && typeof ref.name === "string"
      ? [[exportName, ref.name] as const]
      : [];
  }),
);

/**
 * The source a `getSignalSource`/`watermark` call binds, when it is knowable statically: a
 * built-in source declaration for `getSignalSource`, a string literal key for `watermark`.
 * Anything else (an author-defined source, a computed key) stays silent — miss > false alarm.
 */
function staticSourceName(
  ts: typeof TsApi,
  verb: "getSignalSource" | "watermark",
  arg: TsApi.Expression | undefined,
  bindings: WorkflowBodyBindings,
): string | undefined {
  if (arg === undefined) return undefined;
  if (verb === "watermark") return ts.isStringLiteralLike(arg) ? arg.text : undefined;
  const exportName = resolveVerb(ts, arg, bindings);
  return exportName === null ? undefined : BUILTIN_SOURCE_NAMES.get(exportName);
}

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
  bindings: WorkflowBodyBindings,
  into: WorkflowAuditFinding[],
): void {
  if (declared.has("script")) return;
  const visit = (node: TsApi.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = memberChain(ts, node);
      // The root is `scripts` by convention OR whatever the author named `getScripts()`'s result.
      const isScriptTree =
        chain !== null &&
        (chain.root === "scripts" || bindings.roots.get(chain.root) === "scripts");
      if (chain !== null && isScriptTree && chain.path.length > 0) {
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
  bindings: WorkflowBodyBindings,
  into: WorkflowAuditFinding[],
): void {
  const { declared } = options;
  const visit = (node: TsApi.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // Resolved by binding so `import { waitUntil as at }` is still gated (bare-name matching
      // missed it, and the runtime gate would then be the only thing left).
      const resolved = resolveVerb(ts, callee, bindings);
      if (resolved === "waitUntil") {
        if (!declared.has("schedule")) {
          into.push(missing(ts, sf, node, "schedule", "`waitUntil(…)`"));
        }
      } else if (resolved === "getSignalSource" || resolved === "watermark") {
        const name = staticSourceName(ts, resolved, node.arguments[0], bindings);
        if (name !== undefined && !declared.has(`source:${name}`)) {
          into.push(missing(ts, sf, node, `source:${name}`, `\`${resolved}(${name})\``));
        }
      } else if (ts.isPropertyAccessExpression(callee)) {
        const verb = callee.name.text;
        if (USER_VERBS.has(verb) && !declared.has("user")) {
          into.push(missing(ts, sf, callee, "user", `\`${verb}(…)\``));
        } else {
          const chain = memberChain(ts, callee);
          const isToolTree =
            chain !== null &&
            (chain.root === "tools" || bindings.roots.get(chain.root) === "tools");
          if (chain !== null && isToolTree && chain.path.length > 0) {
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
  const bindings = collectWorkflowBodyBindings(ts, sf);
  scanScriptRefs(ts, sf, options.declared, bindings, findings);
  scanCallSites(ts, sf, options, bindings, findings);
  return findings;
}
