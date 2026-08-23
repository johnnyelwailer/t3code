/**
 * The `"types"` audit facet: run the REAL TypeScript checker over a workflow body and report its
 * diagnostics as {@link WorkflowAuditFinding}s.
 *
 * This is what makes "an invalid workflow fails at typecheck" true for the artifacts that actually
 * run. Every other gate in this package is either an AST pattern match or a runtime throw; a body
 * is transpiled from disk with no tsconfig in sight, so without this facet a wrong argument type, a
 * missing required option, or a misspelled field reaches production unchallenged. The compiler host
 * that makes `@t3team/sdk` resolvable from a workspace outside any install lives in
 * {@link ./t3team-sdk.typeCheckHost.ts}.
 *
 * ── Findings, never failures ─────────────────────────────────────────────────
 * Nothing here throws. A compiler that cannot start, an unresolvable SDK, an internal TypeScript
 * error — each degrades to ONE finding that says typechecking was unavailable and why, so the
 * determinism and capability facets still report and one compiler quirk can never brick every
 * recipe in a workspace. Diagnostics are also filtered to the audited file: a bug inside `effect`'s
 * declarations is not the author's problem and must not appear as their finding.
 */

import {
  findingAt,
  findingWithoutPosition,
  type WorkflowAuditFinding,
} from "./t3team-sdk.staticAuditTypes.ts";
import {
  defaultAnchorPath,
  getTypeCheckHost,
  type TypeCheckHost,
} from "./t3team-sdk.typeCheckHost.ts";

/** Specifiers a body may import; if these do not resolve, typechecking is meaningless, not lenient. */
const REQUIRED_SPECIFIERS = ["@t3team/sdk", "effect/Schema"] as const;

export interface WorkflowTypeCheckOptions {
  /**
   * Directory anchor for bare-specifier resolution. Defaults to this package's own location, which
   * is what a running host wants; tests override it to prove the degraded path.
   */
  readonly anchorPath?: string;
}

export interface WorkflowTypeCheckSource {
  readonly absolutePath: string;
  readonly sourceText: string;
}

/** Extensions the compiler host will accept as a source file root name. */
const SUPPORTED_SOURCE_EXTENSIONS = [".ts", ".tsx", ".d.ts"] as const;

const hasSupportedSourceExtension = (path: string): boolean => {
  const lower = path.toLowerCase();
  return SUPPORTED_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

/**
 * The file name the compiler program will actually load. TypeScript routes an extensionless root
 * name through its extension-probing path: it never asks the host for the exact name, only for
 * `<name>.ts` / `.tsx` / `.d.ts`. Virtual paths (the validator's `"<inline>"`) therefore need a
 * synthesized `.ts` suffix, or the file never enters the program and the whole check degrades to
 * "unavailable".
 */
const programPathFor = (absolutePath: string): string =>
  hasSupportedSourceExtension(absolutePath) ? absolutePath : `${absolutePath}.ts`;

const unavailable = (reason: string): WorkflowAuditFinding =>
  findingWithoutPosition({
    facet: "types",
    rule: "typecheck-unavailable",
    message:
      `Type checking was skipped: ${reason}. The determinism and capability checks still ran, but ` +
      `type errors in this workflow cannot be reported here. This is an environment problem in the ` +
      `t3team installation, not a problem with the workflow.`,
  });

/**
 * Typecheck one workflow body. Returns `[]` when it is clean, one finding per compiler diagnostic
 * in that file, or exactly one `typecheck-unavailable` finding when the checker could not run.
 */
export function typeCheckWorkflowSource(
  source: WorkflowTypeCheckSource,
  options: WorkflowTypeCheckOptions = {},
): ReadonlyArray<WorkflowAuditFinding> {
  let host: TypeCheckHost;
  try {
    host = getTypeCheckHost(options.anchorPath ?? defaultAnchorPath());
  } catch (error) {
    return [unavailable(`the TypeScript compiler could not be loaded (${describe(error)})`)];
  }

  // Probe the specifiers a body is allowed to import BEFORE building a program. A packed server may
  // have no `.d.ts` for these on disk, and the failure mode we must never ship is a program in which
  // every SDK type is `any` and the workflow therefore "passes".
  const missing = REQUIRED_SPECIFIERS.filter(
    (specifier) => host.resolveFromAnchor(specifier) === undefined,
  );
  if (missing.length > 0) {
    return [
      unavailable(
        `the authoring types could not be resolved from the t3team installation ` +
          `(${missing.join(", ")}). Without them every type would silently widen to \`any\``,
      ),
    ];
  }

  try {
    return collectDiagnostics(host, source);
  } catch (error) {
    return [unavailable(`the TypeScript compiler failed (${describe(error)})`)];
  }
}

function collectDiagnostics(
  host: TypeCheckHost,
  source: WorkflowTypeCheckSource,
): ReadonlyArray<WorkflowAuditFinding> {
  const { ts } = host;
  const programPath = programPathFor(source.absolutePath);
  host.overrides.set(programPath, source.sourceText);
  const program = ts.createProgram([programPath], host.options, host.host, host.lastProgram);
  host.stats.programs += 1;
  host.lastProgram = program;

  const sf = program.getSourceFile(programPath);
  if (sf === undefined) {
    return [unavailable(`the workflow file could not be added to the program`)];
  }

  const findings: WorkflowAuditFinding[] = [];
  for (const diagnostic of ts.getPreEmitDiagnostics(program, sf)) {
    // Only this file, and only real problems: a diagnostic in a dependency's declarations, or a
    // suggestion, is not something the workflow's author can or should act on.
    if (diagnostic.file?.fileName !== programPath) continue;
    if (
      diagnostic.category !== ts.DiagnosticCategory.Error &&
      diagnostic.category !== ts.DiagnosticCategory.Warning
    ) {
      continue;
    }
    findings.push(
      findingAt(sf, diagnostic.start ?? 0, diagnostic.length ?? 0, {
        facet: "types",
        rule: `ts${diagnostic.code}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      }),
    );
  }
  return findings;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
