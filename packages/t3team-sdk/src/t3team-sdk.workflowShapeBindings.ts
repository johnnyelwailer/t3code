/**
 * Which local names in a workflow body actually refer to engine verbs.
 *
 * Bodies used to get their verbs from injected globals, so matching the bare identifier `agent` was
 * the only option. Now that they IMPORT them (Epic 25 §The engine API — imported, not injected), the
 * scans can resolve by BINDING, which fixes both directions of the old approximation:
 *
 *   import { agent as ask } from "@t3team/sdk";   // was invisible — an agent step went unreported
 *   const agent = pickReviewer();                  // was a false positive — a plain call became a step
 *
 * Legacy bodies (no SDK import at all) keep the bare-name behaviour: with nothing imported there are
 * no bindings to resolve, and their verbs genuinely ARE ambient. `hasSdkImport` is what the scans
 * branch on, so the two shapes never silently share one rule.
 *
 * Namespace imports (`import * as sdk`) are resolved too, since `sdk.agent(…)` is a property access
 * that the identifier path would otherwise miss entirely.
 */

import type * as TsApi from "typescript";

/** Value accessors whose RESULT is a call root — `const scripts = getScripts()` → root `scripts`. */
const ROOT_ACCESSORS: Readonly<Record<string, string>> = { getScripts: "scripts", getTools: "tools" };

export interface WorkflowBodyBindings {
  /** True when this body imports the SDK — i.e. binding resolution is meaningful for it. */
  readonly hasSdkImport: boolean;
  /** Local name → canonical verb (`ask` → `agent`), for named and default-ish imports. */
  readonly verbs: ReadonlyMap<string, string>;
  /** Locals holding an SDK namespace object, so `sdk.agent(…)` resolves. */
  readonly namespaces: ReadonlySet<string>;
  /** Locals bound to a tool/script tree, whatever the author named them. */
  readonly roots: ReadonlyMap<string, string>;
}

/**
 * A specifier that means "the SDK": the package itself, its subpaths, or a relative path into the
 * SDK's own modules — the last case is how the SDK's own tests and fixtures import these verbs.
 */
function isSdkSpecifier(text: string): boolean {
  return (
    text === "@t3team/sdk" ||
    text.startsWith("@t3team/sdk/") ||
    /t3team-sdk\.(index|engineApi)\.ts$/.test(text)
  );
}

export function collectWorkflowBodyBindings(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
): WorkflowBodyBindings {
  const verbs = new Map<string, string>();
  const namespaces = new Set<string>();
  const roots = new Map<string, string>();
  let hasSdkImport = false;

  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteralLike(specifier) || !isSdkSpecifier(specifier.text)) continue;
    // A type-only import binds no value, so it can never be the callee of a step.
    if (statement.importClause?.isTypeOnly === true) continue;
    hasSdkImport = true;

    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const imported = element.propertyName?.text ?? element.name.text;
      verbs.set(element.name.text, imported);
    }
  }

  // Root accessors are resolved after imports so an aliased `getScripts` is followed too.
  const visit = (node: TsApi.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const initializer = node.initializer;
      if (initializer !== undefined && ts.isCallExpression(initializer)) {
        const callee = initializer.expression;
        const called = ts.isIdentifier(callee)
          ? (verbs.get(callee.text) ?? (hasSdkImport ? undefined : callee.text))
          : ts.isPropertyAccessExpression(callee) &&
              ts.isIdentifier(callee.expression) &&
              namespaces.has(callee.expression.text)
            ? callee.name.text
            : undefined;
        const root = called === undefined ? undefined : ROOT_ACCESSORS[called];
        if (root !== undefined) roots.set(node.name.text, root);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  return { hasSdkImport, verbs, namespaces, roots };
}

/**
 * The canonical verb a callee refers to, or null when it is not an engine verb. Legacy bodies fall
 * back to the bare name; imported bodies resolve strictly, so a local shadowing a verb name is
 * correctly NOT a step.
 */
export function resolveVerb(
  ts: typeof TsApi,
  callee: TsApi.Expression,
  bindings: WorkflowBodyBindings,
): string | null {
  if (ts.isIdentifier(callee)) {
    const resolved = bindings.verbs.get(callee.text);
    if (resolved !== undefined) return resolved;
    return bindings.hasSdkImport ? null : callee.text;
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    bindings.namespaces.has(callee.expression.text)
  ) {
    return callee.name.text;
  }
  return null;
}
