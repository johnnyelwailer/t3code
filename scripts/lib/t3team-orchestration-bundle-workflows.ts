/**
 * The probe workflow bodies + probe source (split out of
 * scripts/t3team-check-orchestration-bundle.ts for the additive guard's LOC
 * ceiling). CLEAN is the same shape the SDK's typecheck tests use; BAD breaks
 * one argument type so the checker must report ts2345.
 */

const CLEAN_WORKFLOW = `import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const meta = { name: "smoke.clean", inputs: Inputs } as const;

export default async function run() {
  const input = Schema.decodeUnknownSync(Inputs)(getArgs());
  const summary = await agent(\`summarize \${input.topic}\`, { capabilities: "inherit" });
  return { summary };
}
`;
const BAD_WORKFLOW = CLEAN_WORKFLOW.replace(
  "await agent(`summarize ${input.topic}`",
  "await agent(42",
);

export const PROBE_SOURCE = `
const { precheckWorkflowSource, auditWorkflowSourceStatic } = await import(
  process.argv[1]
);

const CLEAN = ${JSON.stringify(CLEAN_WORKFLOW)};
const BAD = ${JSON.stringify(BAD_WORKFLOW)};

// #57: the inlined compiler parses and transpiles from the bundle.
const precheckError = precheckWorkflowSource(CLEAN);
if (precheckError !== null) {
  throw new Error("precheck rejected a valid workflow: " + precheckError.slice(0, 300));
}

// #58: the typecheck facet resolves the staged authoring types and passes a
// clean workflow (no "types" findings, and no typecheck-unavailable).
const cleanFindings = auditWorkflowSourceStatic(
  { absolutePath: "/probe/clean.ts", sourceText: CLEAN },
  { typecheck: true },
);
const cleanTypes = cleanFindings.filter((f) => f.facet === "types");
if (cleanTypes.length > 0) {
  throw new Error("clean workflow produced type findings: " + JSON.stringify(cleanTypes));
}

// #58: a real type error is reported as a ts diagnostic, not a
// typecheck-unavailable degradation.
const badFindings = auditWorkflowSourceStatic(
  { absolutePath: "/probe/bad.ts", sourceText: BAD },
  { typecheck: true },
);
const badTypes = badFindings.filter((f) => f.facet === "types");
if (!badTypes.some((f) => f.rule === "ts2345")) {
  throw new Error("expected ts2345 for the wrong argument type, got: " + JSON.stringify(badTypes));
}

// Regression: the validator's virtual path is extensionless ("<inline>").
// TypeScript 6 routes extensionless root names through its extension-probing
// path and never asks the host for the exact name, so an override map keyed
// on "<inline>" misses and EVERY inline workflow degrades to
// "typecheck-unavailable". The virtual path must behave like a real one:
// clean body → no findings, wrong argument type → the real diagnostic.
const inlineClean = auditWorkflowSourceStatic(
  { absolutePath: "<inline>", sourceText: CLEAN },
  { typecheck: true },
);
if (inlineClean.some((f) => f.facet === "types")) {
  throw new Error("inline clean workflow produced type findings: " + JSON.stringify(inlineClean));
}
const inlineBad = auditWorkflowSourceStatic(
  { absolutePath: "<inline>", sourceText: BAD },
  { typecheck: true },
);
if (!inlineBad.some((f) => f.facet === "types" && f.rule === "ts2345")) {
  throw new Error("expected ts2345 for the inline wrong argument type, got: " + JSON.stringify(inlineBad));
}

console.log("orchestration bundle probe: OK (inlined typescript + staged authoring types + inline virtual path)");
`;
