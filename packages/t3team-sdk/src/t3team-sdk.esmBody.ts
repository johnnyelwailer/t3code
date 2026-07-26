/**
 * Running an ESM-shaped orchestration body: a default-exported async function (Epic 25 §The engine
 * API — imported, not injected).
 *
 * Separate from the loader because the two execution shapes have genuinely different contracts, and
 * this one's contract needs stating where it is implemented:
 *
 * DETERMINISM. The legacy vm path swaps in journaled `Date`/`Math`/`crypto` per run. A real module
 * import cannot — it gets the host globals. So for this shape the determinism SCAN is the
 * enforcement rather than runtime shadowing: `Date.now()`, `Math.random()` and `crypto.randomUUID()`
 * in a body must be rejected at load time. That is a stricter contract, not a weaker one — an
 * authoring error instead of a replay that silently diverges — but it means the scan MUST run for
 * ESM bodies. Never bypass it for this path.
 */

/** Structural, so this module does not import back from the loader that calls it. */
type EsmWorkflowSource = {
  readonly absolutePath: string;
  readonly sourceText: string;
};

/** True when the body is the ESM shape. Matches a real `export default`, not a mention of one. */
export function isEsmWorkflowBody(sourceText: string): boolean {
  return /^\s*export\s+default\s/m.test(sourceText);
}

/**
 * Monotonic cache-buster so an edited body re-imports fresh, matching the recipe-module loader. A
 * counter rather than a clock: this is loader plumbing outside the journal, and the determinism rules
 * ban ambient time reads on principle — including here.
 */
let esmImportCounter = 0;

/**
 * Import the module for real — so its `import`s resolve, including the engine API from
 * `@t3team/sdk` — and call its default export. The caller has already bound the run into
 * `withWorkflowRuntime` + `withBodyApi`, which is how those imported verbs find it.
 */
export async function runEsmWorkflowBody(source: EsmWorkflowSource): Promise<unknown> {
  const moduleUrl = new URL(`file://${source.absolutePath}`);
  moduleUrl.searchParams.set("v", String((esmImportCounter += 1)));
  const imported = (await import(moduleUrl.href)) as {
    readonly default?: () => unknown | Promise<unknown>;
  };
  if (typeof imported.default !== "function") {
    throw new Error(
      `Workflow '${source.absolutePath}' has an \`export default\` that is not a function. An ESM body must default-export the async function the engine calls.`,
    );
  }
  return await imported.default();
}
