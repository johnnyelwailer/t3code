/**
 * The settings grammar of a recipe config (t3team-sdk.recipeConfigStatic.ts): which expressions
 * count as data, and the `defaults` / `scopes` shape of `defineRecipeConfig`'s object.
 */
import type * as TsApi from "typescript";

const REF_CALLS = new Set(["defineWorkflow", "recipeAction"]);

export interface ConfigGrammarState {
  readonly imports: Record<string, { specifier: string; name: string }>;
  readonly refConsts: Set<string>;
  readonly keyLines: Record<string, number>;
  readonly keyRefs: Record<string, string>;
  recipeId: string | null;
}

export function makeConfigGrammar(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  state: ConfigGrammarState,
  report: (node: TsApi.Node, message: string) => void,
) {
  const { imports, refConsts, keyLines, keyRefs } = state;
  const at = (node: TsApi.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf));
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
      state.recipeId = id.text;
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

  return { unwrap, isRefCall, checkSpec };
}
