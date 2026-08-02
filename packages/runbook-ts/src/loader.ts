/**
 * Generic trusted TypeScript workflow loader.
 *
 * The package owns only the language boundary: parsing the source, extracting a top-level `meta`
 * declaration, compiling the body, and evaluating it with a caller-provided global surface. It
 * does not know about tools, agents, threads, providers, recipes, registries, or any particular
 * workflow engine. Those are adapter-owned values in `bodyGlobals`.
 *
 * This is a trusted-code loader, not a sandbox. A future sandbox can replace this package or wrap
 * the same prepared artifacts without changing the durable engine or the authoring contract.
 */

import * as NodeVM from "node:vm";

import { WorkflowLoadError } from "@runbook/core/errors";

import {
  blankSpans,
  collectBlankSpans,
  findDefaultExportedFunctionName,
  findMetaStatement,
  transpile,
} from "./transpile.ts";
import { loadTypeScript } from "./typescript.ts";

export interface WorkflowSource {
  readonly absolutePath: string;
  readonly sourceText: string;
}

export interface WorkflowPhase {
  readonly title: string;
  readonly detail?: string;
}

/** The metadata shape is intentionally open: adapters may add fields without changing the loader. */
export interface WorkflowMeta {
  readonly name: string;
  readonly description?: string;
  readonly inputs?: unknown;
  readonly outputs?: unknown;
  readonly capabilities?: ReadonlyArray<unknown>;
  readonly phases?: ReadonlyArray<WorkflowPhase>;
  readonly model?: unknown;
  readonly [key: string]: unknown;
}

export interface PreparedWorkflow {
  readonly metaScript: string;
  readonly bodyScript: string;
}

export interface MetaExtractionOptions {
  /** Values available while evaluating the metadata head; no engine primitives are implied. */
  readonly globals?: Readonly<Record<string, unknown>>;
  /** Maximum time spent evaluating the metadata head. Defaults to two seconds. */
  readonly timeoutMs?: number;
}

export function prepareWorkflow(source: WorkflowSource): PreparedWorkflow {
  const ts = loadTypeScript();
  const sourceFile = ts.createSourceFile(
    source.absolutePath,
    source.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const metaStatement = findMetaStatement(ts, sourceFile);
  if (metaStatement === undefined) {
    throw new WorkflowLoadError(
      `Workflow '${source.absolutePath}' has no top-level \`const meta = …\` declaration; the engine cannot extract its meta block.`,
    );
  }

  const headSpans = collectBlankSpans(ts, sourceFile, {
    includeMeta: false,
    metaStatement,
  }).filter((span) => span.start < metaStatement.end);
  const headText = blankSpans(source.sourceText.slice(0, metaStatement.end), headSpans);
  const metaScript = transpile(
    ts,
    `(() => {\n${headText}\nreturn meta;\n})()`,
    source.absolutePath,
  );

  const bodySpans = collectBlankSpans(ts, sourceFile, { includeMeta: true, metaStatement });
  const bodyText = blankSpans(source.sourceText, bodySpans);
  const defaultExport = findDefaultExportedFunctionName(ts, sourceFile);
  if (defaultExport.hasDefaultExport && defaultExport.name === undefined) {
    throw new WorkflowLoadError(
      `Workflow '${source.absolutePath}' default-exports something the engine cannot call. Export a NAMED async function — \`export default async function run() { … }\` — so the loader can invoke it.`,
    );
  }
  const invocation =
    defaultExport.name === undefined ? "" : `\nreturn await ${defaultExport.name}();`;
  const bodyScript = transpile(
    ts,
    `(async () => {\n${bodyText}${invocation}\n})()`,
    source.absolutePath,
  );
  return { metaScript, bodyScript };
}

/** Evaluate only the metadata head with caller-supplied pure values and `Schema`. */
export function extractMeta(
  prepared: PreparedWorkflow,
  source: WorkflowSource,
  schema: unknown,
  options: MetaExtractionOptions = {},
): WorkflowMeta {
  const context: Record<string, unknown> = {
    ...options.globals,
    Schema: schema,
  };
  context["globalThis"] = context;
  NodeVM.createContext(context);
  let result: unknown;
  try {
    result = NodeVM.runInContext(prepared.metaScript, context, {
      filename: source.absolutePath,
      timeout: options.timeoutMs ?? 2000,
    });
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

/** Execute prepared body code against the exact globals supplied by an adapter. */
export async function runWorkflowBody(
  prepared: PreparedWorkflow,
  source: WorkflowSource,
  bodyGlobals: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const context: Record<string, unknown> = { ...bodyGlobals };
  context["globalThis"] = context;
  NodeVM.createContext(context);
  const completion = NodeVM.runInContext(prepared.bodyScript, context, {
    filename: source.absolutePath,
  }) as Promise<unknown>;
  return await completion;
}
