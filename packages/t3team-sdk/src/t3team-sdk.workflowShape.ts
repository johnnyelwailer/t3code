/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Static "shape" derivation for the play-as-shape view (recipe-UX design pass): read a
 * `.workflow.ts` and, WITHOUT executing the body, produce a serializable descriptor of WHAT IT
 * WILL DO — its declared phase strip (`meta.phases`) plus an ordered, kind-tagged list of the
 * primitive calls in its body ({@link ./t3team-sdk.workflowShapeScan.ts}). Reuses the loader's
 * static-extraction infra (`prepareWorkflow` + `extractMeta` for the meta block, plus a
 * TypeScript AST walk — the same parse the loader uses to blank imports). The four step kinds:
 * `read`/`act` (a tool/script that reads/mutates), `agent` (`agent`/`askAgent`), `ask`
 * (`askUser`). Safe to show before the user authorizes execution.
 */

import * as NodeModule from "node:module";

import * as Schema from "effect/Schema";
import type * as TsApi from "typescript";

import { extractMeta, prepareWorkflow, type WorkflowSource } from "./t3team-sdk.loader.ts";
import { scanSteps } from "./t3team-sdk.workflowShapeScan.ts";

const nodeRequire = NodeModule.createRequire(import.meta.url);
let cachedTs: typeof TsApi | undefined;
function loadTypescript(): typeof TsApi {
  cachedTs ??= nodeRequire("typescript") as typeof TsApi;
  return cachedTs;
}

export type WorkflowStepKind = "read" | "agent" | "ask" | "act";

export interface WorkflowShapeStep {
  /** The `phase()` group this step runs under, or null if it precedes any `phase()` call. */
  readonly phase: string | null;
  readonly kind: WorkflowStepKind;
  readonly label: string;
}

/**
 * A declared `meta.capabilities` entry, normalized for the pre-execution permission UI
 * (spec 25 §Capability gating): engine feature strings become `kind: "feature"` (the UI
 * renders them via the engine's own label table); `ToolGroupRef`s become `kind: "tool-group"`
 * carrying their author-declared `label`/`description`. Unrecognized entries are dropped —
 * the preview never invents a permission it cannot describe.
 */
export interface WorkflowShapeCapability {
  readonly kind: "feature" | "tool-group";
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
}

export interface WorkflowShape {
  readonly name: string;
  readonly description?: string;
  readonly phases: ReadonlyArray<{ readonly title: string }>;
  readonly steps: ReadonlyArray<WorkflowShapeStep>;
  /** Declared elevated capabilities; empty for a workflow that declares none. */
  readonly capabilities: ReadonlyArray<WorkflowShapeCapability>;
}

/** Normalize the loosely-typed extracted `meta.capabilities` into shape capabilities. */
function normalizeCapabilities(
  entries: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<WorkflowShapeCapability> {
  const normalized: WorkflowShapeCapability[] = [];
  for (const entry of entries ?? []) {
    if (typeof entry === "string" && entry.length > 0) {
      normalized.push({ kind: "feature", id: entry });
      continue;
    }
    if (entry !== null && typeof entry === "object") {
      const ref = entry as { kind?: unknown; id?: unknown; label?: unknown; description?: unknown };
      if (ref.kind === "tool-group" && typeof ref.id === "string" && ref.id.length > 0) {
        normalized.push({
          kind: "tool-group",
          id: ref.id,
          ...(typeof ref.label === "string" ? { label: ref.label } : {}),
          ...(typeof ref.description === "string" ? { description: ref.description } : {}),
        });
      }
    }
  }
  return normalized;
}

/**
 * Derive the read-only shape descriptor for a workflow source. Meta extraction is best-effort: a
 * malformed `meta` still yields the scanned step list, with the phase strip falling back to the
 * distinct `phase()` titles encountered in the body.
 */
export function deriveWorkflowShape(source: WorkflowSource): WorkflowShape {
  const ts = loadTypescript();
  const sf = ts.createSourceFile(
    source.absolutePath,
    source.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const { steps, phaseTitles } = scanSteps(ts, sf);

  let name = "";
  let description: string | undefined;
  let metaPhases: ReadonlyArray<{ readonly title: string }> | undefined;
  let capabilities: ReadonlyArray<WorkflowShapeCapability> = [];
  try {
    const meta = extractMeta(prepareWorkflow(source), source, Schema);
    name = meta.name;
    description = typeof meta.description === "string" ? meta.description : undefined;
    metaPhases = meta.phases?.map((phase) => ({ title: phase.title }));
    capabilities = normalizeCapabilities(meta.capabilities);
  } catch {
    // Best-effort preview: keep the step list even when meta refuses to extract.
  }

  const phases =
    metaPhases && metaPhases.length > 0 ? metaPhases : phaseTitles.map((title) => ({ title }));
  return {
    name,
    ...(description === undefined ? {} : { description }),
    phases,
    steps,
    capabilities,
  };
}
