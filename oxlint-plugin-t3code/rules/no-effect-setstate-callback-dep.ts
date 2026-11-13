import { defineRule, type ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { unwrapExpression } from "../utils.ts";

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);
const EFFECT_HOOK_TEXT = /use(?:Layout|Insertion)?Effect/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|[\\/](?:tests?|__tests__)[\\/]/;
const HOOK_NAME = /^use[A-Z]/;
const SETTER_NAME = /^set[A-Z]/;
const CALLBACK_NAME = /^(on|handle)[A-Z]|Callback$|Handler$|Runner$|Fn$/;
const STABLE_HOOKS = new Set([
  "useState",
  "useReducer",
  "useRef",
  "useCallback",
  "useMemo",
  "useContext",
  "useId",
  "useSyncExternalStore",
  "useEffectEvent",
  "useLatest",
  "useLatestCallback",
]);
// Hooks whose return is a new function identity on most renders. useCallback
// and useMemo are intentionally stable when their own deps are, so they are
// not in this set — exhaustive-deps on the useCallback is the right guard there.
const FUNCTION_HOOKS = new Set(["useAtomQueryRunner"]);
const BUILTIN_SETTER_LOOKALIKES = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "setAttribute",
  "setAttributeNS",
  "setItem",
  "setProperty",
  "setPrototypeOf",
  "setFullYear",
  "setHours",
  "setMinutes",
  "setSeconds",
  "setMilliseconds",
  "setDate",
  "setMonth",
  "setTime",
  "setUTCDate",
  "setUTCHours",
  "setUTCMinutes",
  "setUTCSeconds",
  "setUTCMilliseconds",
  "setUTCFullYear",
  "setUTCMonth",
]);
const LATEST_WRAPPERS = new Set(["useLatest", "useLatestCallback", "useEffectEvent"]);

const MESSAGE =
  "This effect sets state and lists a callback, function prop, or hook-returned function " +
  "in its dependencies. An unstable identity retriggers the effect on every render, which " +
  "sets state again and can freeze the window (fork #923, #918). Hold the callback in a " +
  "ref with `useLatest` or `useLatestCallback` (or React's `useEffectEvent`) and omit it " +
  "from the dependency list. " +
  "If this effect is correct, name why on the line above: " +
  "`// oxlint-disable-next-line t3code/no-effect-setstate-callback-dep -- <why>`.";

type BindingKind =
  | "setter"
  | "callback-param"
  | "param"
  | "hook-fn"
  | "hook-value"
  | "latest"
  | "other";

type Scope = {
  readonly params: Map<string, BindingKind>;
  readonly bindings: Map<string, BindingKind>;
};

type VisitNode = ESTree.Node & { [key: string]: unknown };

const isNode = (value: unknown): value is VisitNode =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof (value as { type: unknown }).type === "string";

function walk(
  node: VisitNode,
  visit: (node: VisitNode, parent: VisitNode | null) => void,
  parent: VisitNode | null = null,
) {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (
      key === "parent" ||
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "range" ||
      key === "loc"
    ) {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const entry of child) {
        if (isNode(entry)) walk(entry, visit, node);
      }
    } else if (isNode(child)) {
      walk(child, visit, node);
    }
  }
}

const functionTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

const calleeName = (node: ESTree.CallExpression): string | null => {
  const callee = unwrapExpression(node.callee);
  if (Option.isNone(callee)) return null;
  const expression = callee.value;
  if (expression.type === "Identifier") return expression.name;
  if (
    expression.type === "MemberExpression" &&
    !expression.computed &&
    expression.property.type === "Identifier"
  ) {
    return expression.property.name;
  }
  return null;
};

const isEffectHook = (node: ESTree.CallExpression): boolean => {
  const name = calleeName(node);
  return name !== null && EFFECT_HOOKS.has(name);
};

const isHookCall = (node: ESTree.CallExpression): boolean => {
  const name = calleeName(node);
  return name !== null && HOOK_NAME.test(name);
};

const hookCalleeName = (node: ESTree.CallExpression): string | null => calleeName(node);

const patternNames = (pattern: ESTree.Node, names: string[] = []): string[] => {
  switch (pattern.type) {
    case "Identifier":
      names.push(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "Property") patternNames(prop.value as ESTree.Node, names);
        else if (prop.type === "RestElement") patternNames(prop.argument as ESTree.Node, names);
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element) patternNames(element as ESTree.Node, names);
      }
      break;
    case "AssignmentPattern":
      patternNames(pattern.left as ESTree.Node, names);
      break;
    case "RestElement":
      patternNames(pattern.argument as ESTree.Node, names);
      break;
    default:
      break;
  }
  return names;
};

const kindForParam = (name: string): BindingKind => {
  if (SETTER_NAME.test(name) && !BUILTIN_SETTER_LOOKALIKES.has(name)) return "setter";
  if (CALLBACK_NAME.test(name)) return "callback-param";
  return "param";
};

const kindForHookReturn = (hookName: string, bindingName: string): BindingKind => {
  if (LATEST_WRAPPERS.has(hookName)) return "latest";
  // useCallback / useMemo / useState / … — stable or not a function. Checked
  // before the Runner/Handler suffix test so `useCallback` is not treated as a
  // fresh-identity hook.
  if (STABLE_HOOKS.has(hookName)) return "hook-value";
  if (FUNCTION_HOOKS.has(hookName) || /Runner$|Handler$|Fn$/.test(hookName)) return "hook-fn";
  if (CALLBACK_NAME.test(bindingName)) return "hook-fn";
  return "hook-value";
};

function collectScopes(program: VisitNode): Map<VisitNode, Scope> {
  const scopes = new Map<VisitNode, Scope>();
  const stack: Scope[] = [];
  const ensure = (node: VisitNode): Scope => {
    const existing = scopes.get(node);
    if (existing) return existing;
    const scope: Scope = { params: new Map(), bindings: new Map() };
    scopes.set(node, scope);
    return scope;
  };

  const visitCollect = (node: VisitNode) => {
    if (functionTypes.has(node.type)) {
      const scope = ensure(node);
      const params = (node as unknown as ESTree.Function).params ?? [];
      for (const param of params) {
        for (const name of patternNames(param as ESTree.Node)) {
          const kind = kindForParam(name);
          scope.params.set(name, kind);
          scope.bindings.set(name, kind);
        }
      }
      stack.push(scope);
    }
    if (node.type === "VariableDeclarator" && stack.length > 0) {
      const scope = stack[stack.length - 1]!;
      const declarator = node as unknown as ESTree.VariableDeclarator;
      const initNode = declarator.init ? unwrapExpression(declarator.init) : Option.none();
      const init = Option.isSome(initNode) ? initNode.value : null;
      const isHook =
        init !== null &&
        init.type === "CallExpression" &&
        isHookCall(init as ESTree.CallExpression);
      const hookName = isHook ? hookCalleeName(init as ESTree.CallExpression) : null;
      const id = declarator.id;
      if (id.type === "ArrayPattern" && hookName === "useState") {
        const setter = id.elements[1];
        if (setter && setter.type === "Identifier") {
          scope.bindings.set(setter.name, "setter");
        }
        const state = id.elements[0];
        if (state && state.type === "Identifier") {
          scope.bindings.set(state.name, "other");
        }
      } else if (id.type === "ArrayPattern" && hookName === "useReducer") {
        const dispatch = id.elements[1];
        if (dispatch && dispatch.type === "Identifier") {
          scope.bindings.set(dispatch.name, "setter");
        }
      } else if (
        id.type === "ObjectPattern" &&
        init !== null &&
        init.type === "Identifier" &&
        scope.params.has(init.name)
      ) {
        // `const { onReady, setStatus, enabled } = params` — classify each property by name.
        for (const name of patternNames(id as ESTree.Node)) {
          scope.bindings.set(name, kindForParam(name));
        }
      } else {
        for (const name of patternNames(id as ESTree.Node)) {
          if (hookName) scope.bindings.set(name, kindForHookReturn(hookName, name));
        }
      }
    }
  };

  // Need enter/exit for stack. Manual walk with function push/pop:
  const walkScoped = (node: VisitNode) => {
    const isFn = functionTypes.has(node.type);
    if (isFn) visitCollect(node);
    else visitCollect(node);
    for (const key of Object.keys(node)) {
      if (
        key === "parent" ||
        key === "leadingComments" ||
        key === "trailingComments" ||
        key === "range" ||
        key === "loc"
      )
        continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const entry of child) {
          if (isNode(entry)) walkScoped(entry);
        }
      } else if (isNode(child)) {
        walkScoped(child);
      }
    }
    if (isFn) stack.pop();
  };
  walkScoped(program);
  return scopes;
}

function resolveBinding(
  name: string,
  functionNode: VisitNode,
  scopes: Map<VisitNode, Scope>,
  functionStack: VisitNode[],
): BindingKind | null {
  // Search from innermost function outward
  for (let i = functionStack.length - 1; i >= 0; i -= 1) {
    const scope = scopes.get(functionStack[i]!);
    if (!scope) continue;
    if (scope.bindings.has(name)) return scope.bindings.get(name) ?? null;
    if (scope.params.has(name)) return scope.params.get(name) ?? null;
  }
  return null;
}

function isSetStateCall(name: string, kind: BindingKind | null): boolean {
  if (kind === "setter") return true;
  if (kind === "callback-param" && SETTER_NAME.test(name) && !BUILTIN_SETTER_LOOKALIKES.has(name))
    return true;
  return false;
}

function isCallbackDep(name: string, kind: BindingKind | null, calledInEffect: boolean): boolean {
  if (kind === "setter" || kind === "latest" || kind === null) return false;
  if (kind === "callback-param") return true;
  if (kind === "hook-fn") return true;
  // A parameter invoked in the effect is a callback even with a generic name.
  if (calledInEffect && kind === "param") return true;
  return false;
}

type Report = { node: ESTree.Node };

function findViolations(program: VisitNode): Report[] {
  const scopes = collectScopes(program);
  const reports: Report[] = [];

  const functionStack: VisitNode[] = [];
  const visit = (node: VisitNode) => {
    const isFn = functionTypes.has(node.type);
    if (isFn) functionStack.push(node);
    if (node.type === "CallExpression" && isEffectHook(node as unknown as ESTree.CallExpression)) {
      const call = node as unknown as ESTree.CallExpression;
      const callbackArg = call.arguments[0];
      const depsArg = call.arguments[1];
      if (!callbackArg || !depsArg || depsArg.type !== "ArrayExpression") {
        if (isFn) {
          /* pop later */
        }
      } else {
        const callback = callbackArg as unknown as VisitNode;
        const calledNames = new Set<string>();
        const setStateNames: string[] = [];
        walk(callback, (inner) => {
          if (inner.type !== "CallExpression") return;
          const name = calleeName(inner as unknown as ESTree.CallExpression);
          if (!name) return;
          calledNames.add(name);
          const kind = resolveBinding(name, node, scopes, functionStack);
          if (isSetStateCall(name, kind)) setStateNames.push(name);
        });
        if (setStateNames.length > 0) {
          const deps = (depsArg as ESTree.ArrayExpression).elements;
          for (const element of deps) {
            if (!element || element.type !== "Identifier") continue;
            const name = element.name;
            const kind = resolveBinding(name, node, scopes, functionStack);
            if (isCallbackDep(name, kind, calledNames.has(name))) {
              reports.push({ node: call });
              break;
            }
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (
        key === "parent" ||
        key === "leadingComments" ||
        key === "trailingComments" ||
        key === "range" ||
        key === "loc"
      )
        continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const entry of child) {
          if (isNode(entry)) visit(entry);
        }
      } else if (isNode(child)) {
        visit(child);
      }
    }
    if (isFn) functionStack.pop();
  };
  visit(program);
  return reports;
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Report an effect that sets state and depends on a callback, function prop, or hook-returned function — the #923 render-loop pattern.",
    },
  },
  create(context) {
    if (TEST_FILE.test(context.filename) || !EFFECT_HOOK_TEXT.test(context.sourceCode.text)) {
      return {};
    }
    return {
      Program(program) {
        for (const report of findViolations(program as unknown as VisitNode)) {
          context.report({ node: report.node, message: MESSAGE });
        }
      },
    };
  },
});
