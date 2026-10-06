/**
 * The live provider catalog the orchestration author writes `model` values against, rendered into
 * its kickoff turn. Under V2 there is no broker models tool, and upstream's
 * `orchestrator_capabilities` needs the orchestration capability the author's credential never
 * holds (`t3team-workflowAuthorMcpScope.ts`), so the snapshot taken at launch IS the author's
 * catalog. The launch gate re-checks every slug against the providers live at submission.
 */
import type { ServerProvider } from "@t3tools/contracts";

const modelLabel = (model: ServerProvider["models"][number]): string =>
  [
    model.slug,
    ...(model.isDefault === true && model.isLegacy !== true ? ["(declared default)"] : []),
    ...(model.isLegacy === true ? ["(legacy)"] : []),
  ].join(" ");

/** One line per enabled instance: `- <instanceId> [<driver>]: slug (declared default), …`. */
export function formatWorkflowAuthorCatalog(
  providers: ReadonlyArray<ServerProvider> | undefined,
): string {
  const enabled = (providers ?? []).filter((provider) => provider.enabled);
  if (enabled.length === 0) {
    return "No live provider catalog is available: omit `model` and let agents inherit the caller's.";
  }
  return [
    "Name a target as '<instanceId>' (its declared default) or '<instanceId>/<slug>' (exact).",
    'Natural-language constraints in the intent ("use cursor auto") map to an entry here:',
    ...enabled.map(
      (provider) =>
        `- ${provider.instanceId} [${provider.driver}]: ${provider.models.map(modelLabel).join(", ") || "(no models listed)"}`,
    ),
  ].join("\n");
}
