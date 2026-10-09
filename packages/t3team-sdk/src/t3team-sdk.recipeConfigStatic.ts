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

const REF_CALLS = new Set(["defineWorkflow", "recipeAction"]);

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
  let recipeId: string | null = null;
  const at = (node: TsApi.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const report = (node: TsApi.Node, message: string) => {
    const { line, character } = at(node);
    diagnostics.push({ line: line + 1, column: character + 1, message });
  };
  const unwrap = (node: TsApi.Expression): TsApi.Expression =>
    ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
      ? unwrap(node.expression)
      : node;
  const isRefCall = (node: TsApi.Expression): boolean =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    REF_CALLS.has(node.expression.text) &&
    node.arguments.length >= 1 &&
    node.arguments.every((argument) => ts.isStringLiteralLike(argument));

  const checkValue = (raw: TsApi.Expression, path: string | null): void => {
    const node = unwrap(raw);
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(node.operand)) ||
      isRefCall(node)
    ) {
      return;
    }
    if (ts.isIdentifier(node)) {
      if (!(node.text in imports) && !refConsts.has(node.text)) {
        report(node, `'${node.text}' is not an import or a reference; settings must be data.`);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) report(element, "Spreads are not data; list the values.");
        else checkValue(element, null);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      checkObject(node, path);
      return;
    }
    report(
      node,
      `A computed value is not data (${ts.SyntaxKind[node.kind]}); use a literal or a reference.`,
    );
  };

  const checkObject = (node: TsApi.ObjectLiteralExpression, path: string | null): void => {
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        checkValue(property.name, null);
        if (path !== null) {
          keyLines[`${path}.${property.name.text}`] = at(property).line + 1;
          if (property.name.text in imports)
            keyRefs[`${path}.${property.name.text}`] = property.name.text;
        }
        continue;
      }
      if (!ts.isPropertyAssignment(property)) {
        report(property, "Only `key: value` entries are data (no methods, getters or spreads).");
        continue;
      }
      const name = property.name;
      if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
        report(name, "Computed keys are not data; write the key out.");
        continue;
      }
      if (path !== null) {
        keyLines[`${path}.${name.text}`] = at(property).line + 1;
        const value = unwrap(property.initializer);
        if (ts.isIdentifier(value) && value.text in imports)
          keyRefs[`${path}.${name.text}`] = value.text;
      }
      checkValue(property.initializer, null);
    }
  };

  const checkSpec = (call: TsApi.CallExpression): void => {
    const [id, spec] = call.arguments;
    if (id === undefined || !ts.isStringLiteralLike(id)) {
      report(call, "defineRecipeConfig needs the recipe id as a string literal first.");
    } else {
      recipeId = id.text;
    }
    const body = spec === undefined ? undefined : unwrap(spec);
    if (body === undefined || !ts.isObjectLiteralExpression(body)) {
      report(call, "defineRecipeConfig needs an object literal { defaults, scopes }.");
      return;
    }
    for (const property of body.properties) {
      const key =
        property.name !== undefined && ts.isIdentifier(property.name) ? property.name.text : "";
      if (!ts.isPropertyAssignment(property) || (key !== "defaults" && key !== "scopes")) {
        report(property, "A config holds only `defaults` and `scopes`.");
        continue;
      }
      const value = unwrap(property.initializer);
      if (key === "defaults") {
        if (ts.isObjectLiteralExpression(value)) checkObject(value, "defaults");
        else report(value, "`defaults` must be an object literal.");
        continue;
      }
      if (!ts.isArrayLiteralExpression(value)) {
        report(value, "`scopes` must be a list of object literals.");
        continue;
      }
      value.elements.forEach((element, index) => {
        const scope = unwrap(element as TsApi.Expression);
        if (ts.isObjectLiteralExpression(scope)) checkObject(scope, `scopes[${index}]`);
        else report(element, "Each scope must be an object literal with `repos`.");
      });
    }
  };

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
  return { recipeId, diagnostics, keyLines, keyRefs, imports };
}
