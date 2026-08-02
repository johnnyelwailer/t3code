/**
 * The load-time static audit entry point (Epic 25 phase 25.5): parse a `.workflow.ts` once and
 * run both scans over it — determinism ({@link ./t3team-sdk.determinismScan.ts}) and
 * `meta.capabilities` ({@link ./t3team-sdk.capabilityScan.ts}). Never executes the body.
 *
 * Wired into the static validate path (`t3team.recipe.validate`) so an authoring agent sees these
 * errors BEFORE a run, rather than as a `PermissionDeniedError` mid-flight. The runtime gates stay
 * the backstop — this is the early-warning half.
 */
import * as Schema from "effect/Schema";
import type * as TsApi from "typescript";

import { normalizeCapabilities } from "./t3team-sdk.capabilityGating.ts";
import { scanCapabilities } from "./t3team-sdk.capabilityScan.ts";
import { isEsmShapedBody, scanDeterminism } from "./t3team-sdk.determinismScan.ts";
import { extractMeta, prepareWorkflow, type WorkflowSource } from "./t3team-sdk.loader.ts";
import type { WorkflowAuditFinding } from "./t3team-sdk.staticAuditTypes.ts";
import { typeCheckWorkflowSource } from "./t3team-sdk.typeCheck.ts";
import { getRegisteredTool } from "./t3team-sdk.ts";
import { loadTypeScript } from "@runbook/ts/typescript";

/** The default tool→group resolver: the SDK's `defineTool` registry. */
export function registryToolGroupResolver(toolId: string): string | undefined {
  return getRegisteredTool(toolId)?.group.id;
}

export interface WorkflowStaticAuditOptions {
  /**
   * Declared capability keys. Omit to derive them from the file's own `meta` (best effort — a
   * `meta` that will not extract yields an empty set, and the capability scan is then SKIPPED so a
   * broken meta does not masquerade as a wall of capability errors).
   */
  readonly declared?: ReadonlySet<string>;
  readonly resolveToolGroupId?: (toolId: string) => string | undefined;
  /**
   * Run the real TypeScript checker too (the `"types"` facet). OFF by default: it builds a
   * `ts.Program`, which costs far more than the AST scans, so a caller opts in per validate rather
   * than paying for it on every load. See {@link ./t3team-sdk.typeCheck.ts}.
   */
  readonly typecheck?: boolean;
  /** Passed through to the type facet; tests use it to force the degraded path. */
  readonly typecheckAnchorPath?: string;
}

/**
 * Audit a workflow source. Returns determinism findings always; capability findings only when the
 * declared capability set is known (passed in, or extractable from `meta`).
 */
export function auditWorkflowSourceStatic(
  source: WorkflowSource,
  options: WorkflowStaticAuditOptions = {},
): ReadonlyArray<WorkflowAuditFinding> {
  const ts = loadTypeScript();
  const sf = ts.createSourceFile(
    source.absolutePath,
    source.sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const findings: WorkflowAuditFinding[] = [...scanDeterminism(ts, sf)];

  let declared = options.declared;
  if (declared === undefined) {
    try {
      declared = normalizeCapabilities(extractMeta(prepareWorkflow(source), source, Schema));
    } catch {
      // A malformed/missing `meta` is already reported by the validate path's own load/meta
      // phases; guessing an empty capability set here would bury it under false positives.
      declared = undefined;
    }
  }
  if (declared !== undefined) {
    findings.push(
      ...scanCapabilities(ts, sf, {
        declared,
        resolveToolGroupId: options.resolveToolGroupId ?? registryToolGroupResolver,
      }),
    );
  }
  // Only an ESM-shaped body is a valid TypeScript MODULE; the retired legacy shape (bare ambient
  // `args`, top-level `return`) still executes via the vm wrapper, so typechecking it would drown
  // a still-working recipe in syntax findings. Legacy bodies keep the AST facets only.
  if (options.typecheck === true && isEsmShapedBody(ts, sf)) {
    const anchorPath = options.typecheckAnchorPath;
    findings.push(
      ...typeCheckWorkflowSource(source, anchorPath === undefined ? {} : { anchorPath }),
    );
  }
  return findings;
}
