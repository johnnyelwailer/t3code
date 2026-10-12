/**
 * The agent-facing provider-capacity notice on the `provider_usage` tool: one
 * line per reported window — instances first, then hub accounts, then hub read
 * errors — framed by the contracts `frameProviderCapacityNotice` the turn-start
 * block uses. On top of that block it dates resets only when they are not today
 * and adds a burn/pacing clause to tight windows; both need the clock and the
 * sample history, which the hot turn-start path deliberately does without.
 *
 * @module t3team-providerCapacityNotice
 */
import {
  frameProviderCapacityNotice,
  type ServerProvider,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  capacityFromProvider,
  hubCapacityFromSources,
  type ProviderCapacityHubAccount,
  type ProviderCapacityHubError,
  type ProviderCapacityInstance,
  type ProviderCapacityWindow,
} from "./t3team-providerCapacityWindows.ts";
import { describeWindowPace } from "./t3team-providerCapacityPace.ts";
import {
  burnRateForKey,
  recordUsageSample,
  type ProviderUsageBurn,
} from "./t3team-providerUsageHistory.ts";

const windowLine = (
  subject: string,
  window: ProviderCapacityWindow,
  burns: ReadonlyMap<string, ProviderUsageBurn>,
  epochMs: number,
): string => {
  const reset = window.resetsDisplay !== undefined ? ` (resets ${window.resetsDisplay})` : "";
  const pace =
    window.severity === "normal"
      ? ""
      : ` · (${describeWindowPace(window, burns.get(window.sampleKey), epochMs)})`;
  return `${subject}: ${window.pool} ${Math.round(window.usedPercent)}%${reset} · severity: ${window.severity}${pace}`;
};

export const renderProviderCapacityNotice = (input: {
  readonly instances: ReadonlyArray<ProviderCapacityInstance>;
  readonly hubAccounts: ReadonlyArray<ProviderCapacityHubAccount>;
  readonly hubErrors: ReadonlyArray<ProviderCapacityHubError>;
  /** Observed burn rates by window `sampleKey`; tight windows without one say so. */
  readonly burns?: ReadonlyMap<string, ProviderUsageBurn>;
  /** The epoch the samples were recorded at; anchors the pace clause. */
  readonly epochMs?: number;
}): string => {
  const burns = input.burns ?? new Map();
  const epochMs = input.epochMs ?? 0;
  const subjects = [
    ...input.instances.map((instance) => ({
      subject: instance.displayName,
      windows: instance.windows,
      empty: instance.unavailable ?? "no usage windows",
    })),
    ...input.hubAccounts.map((account) => ({ ...account, empty: "no usage windows" })),
  ];
  const lines = subjects.flatMap(({ subject, windows, empty }) =>
    windows.length === 0
      ? [`${subject}: ${empty}`]
      : windows.map((window) => windowLine(subject, window, burns, epochMs)),
  );
  lines.push(...input.hubErrors.map((error) => `Usage hub ${error.sourceLabel}: ${error.error}`));
  const tight = subjects.some(({ windows }) => windows.some((w) => w.severity !== "normal"));
  return frameProviderCapacityNotice(
    lines.length === 0 ? ["no usage windows reported"] : lines,
    tight,
  );
};

/**
 * Records every window's percent in the burn history, then renders the notice
 * with the observed rates of the tight windows.
 */
export const buildProviderCapacityNotice = (input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly sources: ReadonlyArray<UsageLimitSourceSnapshot>;
  readonly now: DateTime.DateTime;
}): string => {
  const epochMs = DateTime.toEpochMillis(input.now);
  const instances = input.providers.map((provider) => capacityFromProvider(provider, input.now));
  const hub = hubCapacityFromSources(input.sources, input.now);
  const windows = [...instances, ...hub.accounts].flatMap((subject) => subject.windows);
  for (const window of windows) recordUsageSample(window.sampleKey, window.usedPercent, epochMs);
  const burns = new Map<string, ProviderUsageBurn>();
  for (const window of windows) {
    if (window.severity === "normal") continue;
    const burn = burnRateForKey(window.sampleKey, epochMs);
    if (burn !== undefined) burns.set(window.sampleKey, burn);
  }
  return renderProviderCapacityNotice({
    instances,
    hubAccounts: hub.accounts,
    hubErrors: hub.errors,
    burns,
    epochMs,
  });
};
