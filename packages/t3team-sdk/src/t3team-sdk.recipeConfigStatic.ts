/**
 * The data-only check of a recipe config file (G12), run on its source BEFORE anything imports
 * it, and by `t3_recipe_validate`. A config file may hold:
 *
 *   • imports (a `defineScript` module, `import type` of a recipe, the SDK),
 *   • `const x = defineWorkflow("…")` / `recipeAction("…", "…")` with literal arguments,
 *   • one `export default defineRecipeConfig("<id>", { … })`,
 *
 * and the settings object holds literals, lists, objects and references (an imported binding,
 * one of those consts, or an inline `defineWorkflow` / `recipeAction` call). Anything computed —
 * a function, a call, an operator, a spread, a computed key — is reported with its line, so the
 * settings stay readable and writable as data.
 */
import { loadTypeScript } from "@runbook/ts/typescript";
import type * as TsApi from "typescript";

import { makeConfigGrammar } from "./t3team-sdk.recipeConfigGrammar.ts";

export interface RecipeConfigDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface RecipeConfigStaticResult {
  readonly recipeId: string | null;
  readonly diagnostics: ReadonlyArray<RecipeConfigDiagnostic>;
  /** 1-based line of each settings key: `defaults.<key>`, `scopes[<i>].<key>`. */
  readonly keyLines: Readonly<Record<string, number>>;
  /** Settings keys whose value is an imported binding: key path → local name. */
  readonly keyRefs: Readonly<Record<string, string>>;
  /** Imported value bindings: local name → module specifier and imported name. */
  readonly imports: Readonly<Record<string, { readonly specifier: string; readonly name: string }>>;
}

export function checkRecipeConfigSource(
  fileName: string,
  sourceText: string,
): RecipeConfigStaticResult {
  const ts = loadTypeScript();
  const sf = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics: RecipeConfigDiagnostic[] = [];
  const keyLines: Record<string, number> = {};
  const keyRefs: Record<string, string> = {};
  const imports: Record<string, { specifier: string; name: string }> = {};
  const refConsts = new Set<string>();
  const report = (node: TsApi.Node, message: string) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    diagnostics.push({ line: line + 1, column: character + 1, message });
  };
  const state = { imports, refConsts, keyLines, keyRefs, recipeId: null as string | null };
  const { unwrap, isRefCall, checkSpec } = makeConfigGrammar(ts, sf, state, report);
  let exported = false;
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        clause === undefined ||
        clause.isTypeOnly ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      if (clause.name !== undefined) imports[clause.name.text] = { specifier, name: "default" };
      const named = clause.namedBindings;
      if (named !== undefined && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          if (element.isTypeOnly) continue;
          imports[element.name.text] = {
            specifier,
            name: element.propertyName?.text ?? element.name.text,
          };
        }
      } else if (named !== undefined) {
        report(named, "Namespace imports are not references; import the binding itself.");
      }
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of statement.declarationList.declarations) {
        const initializer =
          declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
        if (isConst && ts.isIdentifier(declaration.name) && initializer && isRefCall(initializer)) {
          refConsts.add(declaration.name.text);
        } else {
          report(
            declaration,
            'Only `const x = defineWorkflow("…")` or `recipeAction("…")` may be declared here.',
          );
        }
      }
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const call = unwrap(statement.expression);
      if (
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === "defineRecipeConfig"
      ) {
        exported = true;
        checkSpec(call);
      } else {
        report(statement, 'The default export must be `defineRecipeConfig("<id>", { … })`.');
      }
      continue;
    }
    report(statement, "A config file holds imports, reference consts and one default export.");
  }
  if (!exported) {
    diagnostics.push({ line: 1, column: 1, message: "No `export default defineRecipeConfig(…)`." });
  }
  return { recipeId: state.recipeId, diagnostics, keyLines, keyRefs, imports };
}
