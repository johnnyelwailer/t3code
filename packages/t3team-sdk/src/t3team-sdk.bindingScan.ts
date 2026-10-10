/**
 * The `"bindings"` audit facet: every VALUE imported from `@t3team/sdk` must be a name the engine
 * binds into the body context ({@link ./t3team-sdk.workflowBoundNames.ts}).
 *
 * Why a facet of its own: the loader erases imports and resolves names from the bound surface, so
 * an import of an unbound export typechecks (the symbol exists in the package) and still fails at
 * runtime with a bare `ReferenceError`. Neither the determinism scan (which only asks "is this the
 * engine API?") nor the type checker can see that gap — only a check against the runtime list can.
 *
 * Type-only imports are erased by TypeScript itself and never reach the body, so they pass.
 */

import type * as TsApi from "typescript";

import { finding, type WorkflowAuditFinding } from "./t3team-sdk.staticAuditTypes.ts";

const ENGINE_API = "@t3team/sdk";

const isEngineApiSpecifier = (text: string): boolean =>
  text === ENGINE_API || text.startsWith(`${ENGINE_API}/`);

function describeBound(bound: ReadonlySet<string>): string {
  return `Names bound at runtime: ${[...bound].sort().join(", ")}.`;
}

/**
 * Report every value binding imported from the engine API that the runtime does not provide.
 * `bound` is the live runtime list, so the message names exactly what IS available.
 */
export function scanBindings(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  bound: ReadonlySet<string>,
): WorkflowAuditFinding[] {
  const findings: WorkflowAuditFinding[] = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteralLike(specifier) || !isEngineApiSpecifier(specifier.text)) continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;

    if (clause.name !== undefined) {
      findings.push(
        finding(ts, sf, clause.name, {
          facet: "bindings",
          rule: "unbound-import",
          message:
            `\`${ENGINE_API}\` has no default export, and the loader erases imports anyway: ` +
            `\`${clause.name.text}\` would be undefined in the body. Import the engine API by ` +
            `name instead. ${describeBound(bound)}`,
        }),
      );
    }
    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      findings.push(
        finding(ts, sf, bindings, {
          facet: "bindings",
          rule: "unbound-import",
          message:
            `A namespace import of \`${ENGINE_API}\` is erased by the loader, so ` +
            `\`${bindings.name.text}.x\` would throw at runtime. Import each name you call ` +
            `directly. ${describeBound(bound)}`,
        }),
      );
      continue;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const local = element.name.text;
      const imported = element.propertyName?.text;
      // The loader ERASES the import; it never rewrites identifiers. So the body's LOCAL name is
      // what must resolve against the bound surface — an alias `{ agent as ask }` leaves `ask`
      // undefined even though `agent` is bound, and `{ notBound as agent }` would wrongly pass.
      if (imported !== undefined && imported !== local) {
        findings.push(
          finding(ts, sf, element, {
            facet: "bindings",
            rule: "aliased-import",
            message:
              `\`import { ${imported} as ${local} }\` — aliases are not supported because imports ` +
              `are erased and names resolve from the run's bound surface; \`${local}\` would be ` +
              `undefined at runtime. Write \`import { ${imported} }\` and call \`${imported}\`.`,
          }),
        );
        continue;
      }
      if (bound.has(local)) continue;
      findings.push(
        finding(ts, sf, element, {
          facet: "bindings",
          rule: "unbound-import",
          message:
            `\`${local}\` is imported from \`${ENGINE_API}\` but the engine does not bind it ` +
            `into the body, so calling it throws \`ReferenceError: ${local} is not defined\`. ` +
            `Use \`import type\` if it is only a type; otherwise use a bound name. ${describeBound(bound)}`,
        }),
      );
    }
  }
  return findings;
}
