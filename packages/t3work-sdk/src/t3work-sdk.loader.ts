/**
 * The `.workflow.ts` loader (Epic 25 §Static-extraction rules). This is the loader — it
 * transpiles, statically extracts `meta`, and executes the body. It is **not** a sandbox
 * (Stage-1 has none; see the trust-model note below).
 *
 * Responsibilities:
 *   1. Split the file at the `meta` declaration into a *head* (imports + consts + meta)
 *      and a *body* (everything after meta — the durable workflow logic).
 *   2. Statically extract `meta` by running only the head in a `node:vm` context that
 *      exposes `Schema` (and the deterministic globals) but no engine primitives.
 *   3. Compile the body to a JS string wrapped in an async IIFE so top-level `await`
 *      and the body's top-level `return` are legal, then run it in the body context.
 *
 * Approach: **`vm.Script`** (not `vm.SourceTextModule`). The workflow file is an ES module
 * with `import`/`export`/top-level-await, none of which `vm.Script` accepts — so we
 * transform first ({@link ./t3work-sdk.transpile.ts}): blank every `import` statement (the
 * one allowlisted value import, `Schema`, is injected as a global instead), blank `export`
 * modifiers, blank the `meta` statement (the body never needs it), and wrap the remainder
 * in `(async () => { … })()`. The import blanking is unconditional scaffolding — it makes
 * no allow/deny decisions.
 *
 * ── No sandbox ───────────────────────────────────────────────────────────────
 * Stage-1 has **no sandbox**. The body runs in a `vm.Script` context with deterministic
 * `Date`/`Math.random`/`crypto.randomUUID` bound ({@link ./t3work-sdk.workflowGlobals.ts}),
 * but the host realm is reachable via prototype chains. Trust model: "trusted project
 * code." Stage-2 (planned: SES or isolated-vm) is the real sandbox if/when untrusted
 * workflows are in scope.
 */

import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";

import type * as TsApi from "typescript";

import { WorkflowLoadError } from "./t3work-sdk.errors.ts";
import {
  blankSpans,
  collectBlankSpans,
  findMetaStatement,
  transpile,
} from "./t3work-sdk.transpile.ts";
import { deterministicGlobals, hostSource } from "./t3work-sdk.workflowGlobals.ts";

const nodeRequire = createRequire(import.meta.url);

let cachedTs: typeof TsApi | undefined;
function loadTypescript(): typeof TsApi {
  cachedTs ??= nodeRequire("typescript") as typeof TsApi;
  return cachedTs;
}

export interface WorkflowSource {
  readonly absolutePath: string;
  readonly sourceText: string;
}

export interface WorkflowPhase {
  readonly title: string;
  readonly detail?: string;
}

/** The statically-extracted `meta` block. Loosely typed — 25.2 only consumes a subset. */
export interface WorkflowMeta {
  readonly name: string;
  readonly description?: string;
  readonly inputs?: unknown;
  readonly outputs?: unknown;
  readonly capabilities?: ReadonlyArray<unknown>;
  readonly phases?: ReadonlyArray<WorkflowPhase>;
  readonly model?: unknown;
}

/** Pre-compiled artifacts derived from a single parse of the workflow source. */
export interface PreparedWorkflow {
  readonly metaScript: string;
  readonly bodyScript: string;
}

/**
 * Parse the workflow source once and produce the meta-extraction script and the
 * body-execution script. Throws {@link WorkflowLoadError} if `meta` is missing.
 */
export function prepareWorkflow(source: WorkflowSource): PreparedWorkflow {
  const ts = loadTypescript();
  const sourceFile = ts.createSourceFile(
    source.absolutePath,
    source.sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const metaStatement = findMetaStatement(ts, sourceFile);
  if (metaStatement === undefined) {
    throw new WorkflowLoadError(
      `Workflow '${source.absolutePath}' has no top-level \`const meta = …\` declaration; the engine cannot extract its meta block.`,
    );
  }

  // Head = source up to and including the meta statement, with imports + export modifiers
  // blanked, wrapped so it returns the meta object.
  const headSpans = collectBlankSpans(ts, sourceFile, { includeMeta: false, metaStatement }).filter(
    (span) => span.start < metaStatement.end,
  );
  const headText = blankSpans(source.sourceText.slice(0, metaStatement.end), headSpans);
  const metaScript = transpile(
    ts,
    `(() => {\n${headText}\nreturn meta;\n})()`,
    source.absolutePath,
  );

  // Body = whole file with imports, export modifiers, and the meta statement blanked,
  // wrapped in an async IIFE so top-level await + the body's `return` are legal.
  const bodySpans = collectBlankSpans(ts, sourceFile, { includeMeta: true, metaStatement });
  const bodyText = blankSpans(source.sourceText, bodySpans);
  const bodyScript = transpile(ts, `(async () => {\n${bodyText}\n})()`, source.absolutePath);
  return { metaScript, bodyScript };
}

/**
 * Run the meta-extraction script in a context that exposes `Schema` (the one allowlisted
 * pure value import) and nothing else from the engine. Returns the `meta` literal.
 */
export function extractMeta(
  prepared: PreparedWorkflow,
  source: WorkflowSource,
  schema: unknown,
): WorkflowMeta {
  const context: Record<string, unknown> = {
    ...deterministicGlobals(hostSource()),
    Schema: schema,
  };
  context["globalThis"] = context;
  createContext(context);
  let result: unknown;
  try {
    result = runInContext(prepared.metaScript, context, { filename: source.absolutePath });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new WorkflowLoadError(
      `Failed to statically extract \`meta\` from '${source.absolutePath}': ${reason}`,
    );
  }
  if (result === null || typeof result !== "object") {
    throw new WorkflowLoadError(
      `Workflow '${source.absolutePath}' \`meta\` did not evaluate to an object.`,
    );
  }
  const meta = result as WorkflowMeta;
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new WorkflowLoadError(
      `Workflow '${source.absolutePath}' \`meta.name\` must be a non-empty string.`,
    );
  }
  return meta;
}

/**
 * Run the compiled body in a constrained `node:vm` context. `globals` carries the engine
 * surface the loader binds (args, Schema, tools, scripts, log, phase, error classes).
 * The body's `return` value resolves the returned promise.
 */
export async function runWorkflowBody(
  prepared: PreparedWorkflow,
  source: WorkflowSource,
  globals: Record<string, unknown>,
): Promise<unknown> {
  const context: Record<string, unknown> = { ...globals };
  context["globalThis"] = context;
  createContext(context);
  const completion = runInContext(prepared.bodyScript, context, {
    filename: source.absolutePath,
  }) as Promise<unknown>;
  return await completion;
}
