/**
 * Display provenance for forked threads: renders the "forked from A to B"
 * provider/model transition embedded in the fork's provenance note.
 *
 * Names come from the live ProviderRegistry snapshots (the same ones the
 * model picker projects via `buildRuntimeModelCatalog`). Anything that cannot
 * be resolved degrades to the raw instance id / model slug — the note is
 * never blocked or enriched with a fabricated name.
 *
 * @module t3team-fork-provenance
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";

type ForkModelSelection = Pick<ModelSelection, "instanceId" | "model">;

const ARROW = "\u2192";

/**
 * `<providerDisplayName> (<modelName>)` for one side of the transition.
 * Falls back to the raw instance id / model slug when the snapshot list has
 * no entry (or no display name / model name) for it.
 */
export function forkModelSelectionLabel(
  selection: ForkModelSelection,
  providers: ReadonlyArray<ServerProvider>,
): string {
  const provider = providers.find((p) => p.instanceId === selection.instanceId);
  const providerName = provider?.displayName ?? String(selection.instanceId);
  const modelName =
    provider?.models.find((model) => model.slug === selection.model)?.name ??
    String(selection.model);
  return `${providerName} (${modelName})`;
}

/**
 * The transition clause for the note, or `undefined` when it cannot be stated
 * truthfully (the parent thread carries no model selection of its own, so the
 * "from" side would be a guess).
 *
 * Same selection on both sides is stated once; a real switch reads
 * `Claude (Opus 4) → Nexplore AI (GPT-5)`.
 */
export function forkModelTransition(
  parentSelection: ForkModelSelection | undefined,
  childSelection: ForkModelSelection,
  providers: ReadonlyArray<ServerProvider>,
): string | undefined {
  if (parentSelection == null) return undefined;
  const sameSelection =
    parentSelection.instanceId === childSelection.instanceId &&
    parentSelection.model === childSelection.model;
  if (sameSelection) {
    return `model selection unchanged: ${forkModelSelectionLabel(childSelection, providers)}`;
  }
  return `${forkModelSelectionLabel(parentSelection, providers)} ${ARROW} ${forkModelSelectionLabel(
    childSelection,
    providers,
  )}`;
}

/**
 * The full provenance note text. `modelTransition` is wrapped in parentheses
 * and appended to the first sentence when present; without it the note keeps
 * its original shape.
 */
export function forkProvenanceNote(options: {
  readonly parentTitle: string;
  readonly omittedMessageCount: number;
  readonly modelTransition: string | undefined;
}): string {
  const { parentTitle, omittedMessageCount, modelTransition } = options;
  const omitted = omittedMessageCount;
  const openSentence = `This thread was forked from \u201c${parentTitle}\u201d`;
  const transition = modelTransition === undefined ? "" : ` (${modelTransition})`;
  return (
    `${openSentence}${transition}. ` +
    `${omitted} middle message${omitted === 1 ? "" : "s"} of the original conversation ` +
    "were omitted to keep this thread's context small. Use the t3team.thread.search_source " +
    "tool to look anything up from the omitted range, or open the original thread for the full history."
  );
}
