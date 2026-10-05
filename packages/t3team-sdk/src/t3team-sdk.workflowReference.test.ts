// @effect-diagnostics nodeBuiltinImport:off -- compiles example bodies with node:vm, like the engine.
/**
 * Two guarantees about the author reference: (1) the checked-in text IS a fresh generation (no
 * drift from the runtime), and (2) every example it ships passes the same gates the engine applies —
 * the static audit including the type checker and the bindings facet, the loader's structural
 * parse, and V8's compile of the transpiled scripts. A reference that teaches something the runtime
 * rejects fails here.
 */
import * as NodeVM from "node:vm";

import { describe, expect, it } from "vite-plus/test";

import { prepareWorkflow } from "./t3team-sdk.loader.ts";
import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
import { formatFinding } from "./t3team-sdk.staticAuditTypes.ts";
import { WORKFLOW_AUTHOR_REFERENCE } from "./t3team-sdk.workflowReference.generated.ts";
import { WORKFLOW_REFERENCE_EXAMPLES } from "./t3team-sdk.workflowReferenceExamples.ts";
import { generateWorkflowAuthorReference } from "./t3team-sdk.workflowReferenceGenerate.ts";

describe("workflow author reference", () => {
  it("checked-in text matches a fresh generation (run: node scripts/t3team-generate-workflow-reference.ts)", () => {
    expect(generateWorkflowAuthorReference()).toBe(WORKFLOW_AUTHOR_REFERENCE);
  }, 60_000);

  it("ships every example verbatim", () => {
    for (const example of WORKFLOW_REFERENCE_EXAMPLES) {
      expect(WORKFLOW_AUTHOR_REFERENCE).toContain(example.source);
    }
  });

  for (const example of WORKFLOW_REFERENCE_EXAMPLES) {
    it(`example "${example.title}" passes the static audit, loader and compile`, () => {
      const source = {
        absolutePath: `/reference/${example.title}.workflow.ts`,
        sourceText: example.source,
      };
      const findings = auditWorkflowSourceStatic(source, { typecheck: true });
      expect(findings.map(formatFinding)).toEqual([]);
      const prepared = prepareWorkflow(source);
      expect(() => new NodeVM.Script(prepared.metaScript)).not.toThrow();
      expect(() => new NodeVM.Script(prepared.bodyScript)).not.toThrow();
    }, 60_000);
  }
});
