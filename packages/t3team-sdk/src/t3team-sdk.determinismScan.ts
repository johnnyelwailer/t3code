/**
 * Static determinism scan of a `.workflow.ts` (Epic 25 phase 25.5 — "Determinism enforcement:
 * lint rules flagging nondeterminism patterns"). Pure AST inspection; the body never runs.
 *
 * ── What this does NOT flag, and why ─────────────────────────────────────────
 * `Date.now()`, argless `new Date()`, `Math.random()` and `crypto.randomUUID()` are
 * **deliberately allowed**. Epic 25 §Rules authors must follow, rule 1 is explicit:
 * "Ambient nondeterminism is journaled, not banned. Workflow bodies see deterministic `Date`
 * (`Date.now()` / `new Date()`), `Math.random`, and `crypto.randomUUID` — call them exactly as
 * you would in any JS code. The engine journals each call, so on replay they return the recorded
 * value… Stage-1 does **not** refuse a workflow for reading ambient state". The loader binds
 * exactly those as journaled globals ({@link ./t3team-sdk.workflowGlobals.ts}), so flagging them
 * would contradict the contract. §Sandboxing says the same: "There is no banned-globals scan and
 * no AST refusal".
 *
 * ── What it flags ────────────────────────────────────────────────────────────
 *  1. `runtime-import` — a non-type `import`. Rule 2: "Imports are types-only… The linter flags
 *     non-type imports so the gap surfaces early." The loader blanks every import, so the binding
 *     silently becomes `undefined` at run time. `Schema` from `effect` / `effect/Schema` is the
 *     one allowlisted value import (injected as a global) and is exempt.
 *  2. `module-mutable-state` — a `let`/`var` among the file's HEAD statements (before/at `meta`).
 *     "Module-level mutable state | Lint | Flagged by the linter" and "Lint refuses module-level
 *     `let`/`var`". Deliberately scoped to the head: statements after `meta` are the durable body,
 *     whose top level is per-run local scope (a `let` accumulator between awaits is normal,
 *     deterministic code), so flagging those would be a false-positive machine.
 *  3. `unjournaled-host-global` — a reference to a nondeterministic host global that the body
 *     context does NOT bind (`setTimeout`/`setInterval`, `process`, `require`, `fetch`, …). These
 *     are `ReferenceError`s at run time, and rule 1 names the replacements: "for a durable timer
 *     use `wait(ms)` (it suspends across a server restart, which a raw `setTimeout` cannot); for
 *     network or filesystem I/O, call it from inside a `script` module rather than inline, so the
 *     result is journaled." Suppressed when the author declares/shadows the name themselves.
 */
import type * as TsApi from "typescript";

import { UNJOURNALED_GLOBALS } from "./t3team-sdk.determinismGlobals.ts";
import { findMetaStatement } from "./t3team-sdk.transpile.ts";
import {
  collectDeclaredNames,
  finding,
  isValueReference,
  type WorkflowAuditFinding,
} from "./t3team-sdk.staticAuditTypes.ts";

/** The one allowlisted value import: `Schema`, injected as a global by the loader. */
function isAllowlistedSchemaImport(ts: typeof TsApi, node: TsApi.ImportDeclaration): boolean {
  const specifier = node.moduleSpecifier;
  if (!ts.isStringLiteralLike(specifier)) return false;
  if (specifier.text !== "effect" && specifier.text !== "effect/Schema") return false;
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.name !== undefined) return clause.name.text === "Schema";
  const bindings = clause.namedBindings;
  if (bindings === undefined) return false;
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === "Schema";
  return bindings.elements.every((element) => element.name.text === "Schema");
}

/**
 * An ESM-shaped body (Epic 25 §The engine API — imported, not injected) default-exports the function
 * the engine calls. This matters to the import rule: an ESM body is imported for REAL, so its imports
 * are not blanked and importing the engine API is the sanctioned way to reach it — while a legacy
 * vm-wrapped body has every import blanked, so the SAME line would leave `agent` undefined at run
 * time. One rule, two body shapes, opposite verdicts; hence the branch rather than a blanket exemption.
 */
export function isEsmShapedBody(ts: typeof TsApi, sf: TsApi.SourceFile): boolean {
  return (
    sf.statements.some(
      (statement) =>
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ===
          true,
    ) || sf.statements.some((statement) => ts.isExportAssignment(statement))
  );
}

/** The engine API itself — the one value import an ESM body is MEANT to have. */
function isEngineApiImport(ts: typeof TsApi, node: TsApi.ImportDeclaration): boolean {
  const specifier = node.moduleSpecifier;
  if (!ts.isStringLiteralLike(specifier)) return false;
  return specifier.text === "@t3team/sdk" || specifier.text.startsWith("@t3team/sdk/");
}

function scanImports(ts: typeof TsApi, sf: TsApi.SourceFile, into: WorkflowAuditFinding[]): void {
  const isEsmBody = isEsmShapedBody(ts, sf);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    // A bare `import "./side-effect.ts"` has no clause: nothing is bound, so nothing diverges.
    if (statement.importClause === undefined) continue;
    if (statement.importClause.isTypeOnly) continue;
    if (isAllowlistedSchemaImport(ts, statement)) continue;
    if (isEsmBody && isEngineApiImport(ts, statement)) continue;
    const bindings = statement.importClause.namedBindings;
    const allSpecifiersTypeOnly =
      statement.importClause.name === undefined &&
      bindings !== undefined &&
      !ts.isNamespaceImport(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly);
    if (allSpecifiersTypeOnly) continue;
    into.push(
      finding(ts, sf, statement, {
        facet: "determinism",
        rule: "runtime-import",
        message: isEsmBody
          ? "A workflow body may import the engine API (`@t3team/sdk`) and types, nothing else " +
            "(Epic 25 determinism rule 2): any other runtime dependency can read host state that a " +
            "replay cannot reproduce. Use `import type { … }`, or move the dependency into a " +
            "`script` module, whose calls the engine journals."
          : "Workflow imports are types-only (Epic 25 determinism rule 2): the loader blanks every " +
            "import, so this binding is `undefined` in the body. Use `import type { … }`, or move " +
            "the runtime dependency into a `script` module. Only `Schema` from `effect` is injected.",
      }),
    );
  }
}

function scanHeadMutableState(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  into: WorkflowAuditFinding[],
): void {
  const metaEnd = findMetaStatement(ts, sf)?.end ?? 0;
  for (const statement of sf.statements) {
    if (statement.getStart(sf) >= metaEnd) break;
    if (!ts.isVariableStatement(statement)) continue;
    const flags = statement.declarationList.flags;
    if ((flags & ts.NodeFlags.Const) !== 0) continue;
    into.push(
      finding(ts, sf, statement, {
        facet: "determinism",
        rule: "module-mutable-state",
        message:
          "Module-level mutable state breaks replay (Epic 25: the linter refuses module-level " +
          "`let`/`var`). Declare head values with `const`; keep per-run mutable state inside the " +
          "body, after `meta`.",
      }),
    );
  }
}

function scanHostGlobals(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  into: WorkflowAuditFinding[],
): void {
  const declared = collectDeclaredNames(ts, sf);
  const seen = new Set<string>();
  const visit = (node: TsApi.Node): void => {
    if (ts.isIdentifier(node)) {
      const advice = UNJOURNALED_GLOBALS.get(node.text);
      if (advice !== undefined && !declared.has(node.text) && isValueReference(ts, node)) {
        const key = `${node.text}:${node.getStart(sf)}`;
        if (!seen.has(key)) {
          seen.add(key);
          into.push(
            finding(ts, sf, node, {
              facet: "determinism",
              rule: "unjournaled-host-global",
              message: `'${node.text}' is not bound in the workflow body context and its value is not journaled, so it is a ReferenceError at run time and unsafe for replay. ${advice}`,
            }),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Run every determinism rule over an already-parsed workflow source file. */
export function scanDeterminism(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
): ReadonlyArray<WorkflowAuditFinding> {
  const findings: WorkflowAuditFinding[] = [];
  scanImports(ts, sf, findings);
  scanHeadMutableState(ts, sf, findings);
  scanHostGlobals(ts, sf, findings);
  return findings;
}
