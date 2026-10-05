/**
 * Collect every `model: "<literal>"` an orchestration names, with its position — the AST half of
 * the live model-slug check. The host owns the other half (resolving each literal against its
 * provider catalog), so this stays a pure scan: no catalog, no policy, no verdict.
 *
 * Only string literals count; a computed `model` is the runtime resolver's job. A `models: [...]`
 * cascade is a preference ladder whose unavailable rungs are skipped, never an error, so it is not
 * collected.
 */
import type * as TsApi from "typescript";

import { loadTypeScript } from "@runbook/ts/typescript";

export interface WorkflowModelLiteral {
  readonly line: number;
  readonly column: number;
  readonly literal: string;
}

export function collectWorkflowModelLiterals(input: {
  readonly sourceText: string;
  readonly absolutePath: string;
}): ReadonlyArray<WorkflowModelLiteral> {
  const ts = loadTypeScript();
  const sf = ts.createSourceFile(
    input.absolutePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const literals: WorkflowModelLiteral[] = [];
  const visit = (node: TsApi.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "model" &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      literals.push({ line: line + 1, column: character + 1, literal: node.initializer.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return literals;
}
