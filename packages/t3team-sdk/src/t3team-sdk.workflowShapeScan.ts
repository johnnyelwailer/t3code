/**
 * The static AST scan behind {@link ./t3team-sdk.workflowShape.ts}: walk a `.workflow.ts`'s
 * post-`meta` statements in source order and classify each primitive call against the four-kind
 * vocabulary — `read`/`act` (a tool/script that reads/mutates, BEST-EFFORT from the call's last
 * name segment), `agent` (`agent`/`askAgent`), `ask` (`askUser`) — tracking the current `phase()`
 * group. Pure source inspection; it never executes the body. Split out to keep each module under
 * the additive-guard LOC ceiling.
 */

import type * as TsApi from "typescript";

import { findMetaStatement } from "./t3team-sdk.transpile.ts";
import {
  collectWorkflowBodyBindings,
  resolveVerb,
  type WorkflowBodyBindings,
} from "./t3team-sdk.workflowShapeBindings.ts";
import type { WorkflowShapeStep, WorkflowStepKind } from "./t3team-sdk.workflowShape.ts";

const MAX_LABEL = 100;

/** read-ish verb prefixes — a tool/script whose last name segment starts with one is `read`. */
const READ_VERBS = [
  "get",
  "list",
  "read",
  "fetch",
  "search",
  "find",
  "query",
  "load",
  "view",
  "show",
  "describe",
  "count",
  "check",
  "lookup",
  "has",
  "is",
  "exists",
  "scan",
  "inspect",
  "summar",
  "classif",
  "poll",
  "diff",
];

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_LABEL ? `${oneLine.slice(0, MAX_LABEL - 1)}…` : oneLine;
}

function classifyToolScript(lastSegment: string): WorkflowStepKind {
  const lowered = lastSegment.toLowerCase();
  return READ_VERBS.some((verb) => lowered.startsWith(verb)) ? "read" : "act";
}

/** The statically-knowable human text of a string / template-literal arg. Dynamic template
 * expressions are omitted: source placeholders such as `${cycle}` must never leak into UI. */
function staticStringLabel(
  ts: typeof TsApi,
  node: TsApi.Node | undefined,
  _sf: TsApi.SourceFile,
): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteralLike(node)) return truncate(node.text);
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      text += span.literal.text;
    }
    return truncate(text);
  }
  return null;
}

/** A literal `label` property from an options object, when one is present. */
function explicitCallLabel(
  ts: typeof TsApi,
  call: TsApi.CallExpression,
  sf: TsApi.SourceFile,
): string | null {
  const options = call.arguments[1];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return null;
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    if (
      !(
        (ts.isIdentifier(name) && name.text === "label") ||
        (ts.isStringLiteralLike(name) && name.text === "label")
      )
    )
      continue;
    return staticStringLabel(ts, property.initializer, sf);
  }
  return null;
}

/** The leftmost identifier of a member chain (`tools.github.pull.merge` → `tools`). */
function rootIdentifier(ts: typeof TsApi, expr: TsApi.Expression): string | null {
  let current: TsApi.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
}

interface CallSink {
  readonly onPhase: (title: string) => void;
  readonly onStep: (kind: WorkflowStepKind, label: string) => void;
}

/** Classify a single call expression against the primitive vocabulary, routing it to the sink. */
function classifyCall(
  ts: typeof TsApi,
  call: TsApi.CallExpression,
  sf: TsApi.SourceFile,
  sink: CallSink,
  bindings: WorkflowBodyBindings,
): void {
  const callee = call.expression;
  const arg0 = call.arguments[0];

  // Resolved by IMPORTED BINDING where the body imports the SDK, so `import { agent as ask }` is
  // seen and a local `const agent = …` is not. Legacy injected-globals bodies fall back to the bare
  // name inside resolveVerb.
  const verb = resolveVerb(ts, callee, bindings);
  if (verb === "phase") {
    const title = staticStringLabel(ts, arg0, sf);
    if (title !== null) sink.onPhase(title);
    return;
  }
  if (verb === "agent") {
    sink.onStep(
      "agent",
      explicitCallLabel(ts, call, sf) ?? staticStringLabel(ts, arg0, sf) ?? "Agent turn",
    );
    return;
  }
  if (verb !== null) return;

  if (!ts.isPropertyAccessExpression(callee)) return;
  const name = callee.name.text;
  if (name === "askAgent") {
    sink.onStep(
      "agent",
      explicitCallLabel(ts, call, sf) ?? staticStringLabel(ts, arg0, sf) ?? "Ask the agent",
    );
    return;
  }
  if (name === "askUser") {
    sink.onStep(
      "ask",
      explicitCallLabel(ts, call, sf) ?? staticStringLabel(ts, arg0, sf) ?? "Ask the user",
    );
    return;
  }
  const root = rootIdentifier(ts, callee);
  if (root === null) return;
  // `tools`/`scripts` by convention, plus whatever the author named the accessor result
  // (`const s = getScripts()` → `s.computeStats()` is still a script step).
  const rootKind = root === "tools" || root === "scripts" ? root : bindings.roots.get(root);
  if (rootKind !== undefined) {
    sink.onStep(classifyToolScript(name), truncate(callee.getText(sf).slice(root.length + 1)));
  }
}

/** Walk the post-`meta` statements in source order, tracking the current `phase()` group. */
export function scanSteps(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
): { steps: WorkflowShapeStep[]; phaseTitles: string[] } {
  const steps: WorkflowShapeStep[] = [];
  const phaseTitles: string[] = [];
  let currentPhase: string | null = null;
  const startPos = findMetaStatement(ts, sf)?.end ?? 0;
  const bindings = collectWorkflowBodyBindings(ts, sf);

  const sink: CallSink = {
    onPhase: (title) => {
      currentPhase = title;
      if (!phaseTitles.includes(title)) phaseTitles.push(title);
    },
    onStep: (kind, label) => steps.push({ phase: currentPhase, kind, label }),
  };

  const visit = (node: TsApi.Node): void => {
    if (ts.isCallExpression(node)) classifyCall(ts, node, sf, sink, bindings);
    ts.forEachChild(node, visit);
  };
  for (const statement of sf.statements) {
    if (statement.getStart(sf) >= startPos) visit(statement);
  }
  return { steps, phaseTitles };
}
