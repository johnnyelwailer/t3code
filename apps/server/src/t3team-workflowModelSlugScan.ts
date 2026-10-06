/**
 * Static check of the provider/model literals an orchestration names, against the LIVE catalog.
 *
 * Incident shape (nexi #339): authors copied stale slugs from examples; the run then died at its
 * first `agent()` call with the resolver's error. The resolver already produces the right message
 * (it lists the valid instances / slugs), so each literal the SDK collects
 * (`collectWorkflowModelLiterals`) runs through the SAME resolver `start_child` and the engine
 * use ({@link resolveStartChildModelSelection}) — one source of truth for "is this a real model
 * here".
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { collectWorkflowModelLiterals } from "@t3team/sdk";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";
import { parseWorkflowModelOption } from "./t3team-workflowModelSelection.ts";

export interface WorkflowModelSlugFinding {
  readonly line: number;
  readonly column: number;
  readonly literal: string;
  readonly message: string;
}

export function scanWorkflowModelSlugs(input: {
  readonly sourceText: string;
  readonly absolutePath: string;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly baseModelSelection: ModelSelection;
}): ReadonlyArray<WorkflowModelSlugFinding> {
  const findings: WorkflowModelSlugFinding[] = [];
  for (const item of collectWorkflowModelLiterals(input)) {
    const parsed = parseWorkflowModelOption(item.literal);
    const result = resolveStartChildModelSelection({
      parentModelSelection: input.baseModelSelection,
      requestedProvider: parsed.provider,
      ...(parsed.model === undefined ? {} : { requestedModel: parsed.model }),
      providers: input.providers,
    });
    if (result.ok) continue;
    findings.push({
      line: item.line,
      column: item.column,
      literal: item.literal,
      message: `model "${item.literal}" cannot run here: ${result.message}`,
    });
  }
  return findings;
}
