/**
 * The claim's "who is on it" label: "<Provider> · <model>", from what the V2
 * thread shell stores (`providerInstanceId` + `modelSelection.model`),
 * formatted with the same display names the sidebar uses.
 */

import { localProviderDisplayName } from "@t3tools/contracts";

/** The one display label for a claim's thread; "agent" when no provider is known. */
export function digestAgentLabel(input: {
  readonly providerName?: string | null;
  readonly model: string;
}): string {
  const stored = input.providerName?.trim();
  const provider = stored !== undefined && stored !== "" ? stored : "agent";
  const display = localProviderDisplayName(provider);
  // "<synthetic>" and similar placeholders are not a model the user picked.
  const rawModel = input.model.trim();
  const model = rawModel.startsWith("<") ? "" : rawModel;
  return model !== "" ? `${display} · ${model}` : display;
}
