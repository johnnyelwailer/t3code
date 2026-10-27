/**
 * The compact author reference may only teach what the runtime binds, and its template must pass
 * the same full static audit (type checker included) the launch gate applies.
 */
import { describe, expect, it } from "vite-plus/test";

import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
import { formatFinding } from "./t3team-sdk.staticAuditTypes.ts";
import { WORKFLOW_BOUND_GLOBAL_NAME_SET } from "./t3team-sdk.workflowBoundNames.ts";
import {
  WORKFLOW_AUTHOR_ESSENTIALS,
  WORKFLOW_AUTHOR_TEMPLATE,
  WORKFLOW_ESSENTIAL_NAMES,
} from "./t3team-sdk.workflowEssentials.ts";

describe("workflow author essentials", () => {
  it.each(WORKFLOW_ESSENTIAL_NAMES)("documents %s, which the body binds", (name) => {
    expect(WORKFLOW_BOUND_GLOBAL_NAME_SET.has(name)).toBe(true);
    expect(WORKFLOW_AUTHOR_ESSENTIALS).toContain(`${name}(`);
  });

  it("ships a template that passes the full static audit", () => {
    const findings = auditWorkflowSourceStatic(
      { absolutePath: "/reference/template.workflow.ts", sourceText: WORKFLOW_AUTHOR_TEMPLATE },
      { typecheck: true },
    );
    expect(findings.map(formatFinding)).toEqual([]);
  }, 60_000);
});
