/**
 * Tokens and helpers for setup-surface render-loop tests. `LIVE_SHAPED_DISCOVERY`
 * is the CI-gate token: a new function identity every hook run, a new payload
 * every call. Discovery and auth hooks under test are the real ones.
 */
import { act } from "react";

/** Token the surface-loop CI gate looks for. */
export const LIVE_SHAPED_DISCOVERY = "LIVE_SHAPED_DISCOVERY" as const;

export const RENDER_CAP = 80;

/** A new function identity wrapping `impl`, used to mimic an unstable hook return. */
export function liveShapedFn<T extends (...args: never[]) => unknown>(impl: T): T {
  return ((...args: never[]) => impl(...args)) as T;
}

export type RenderCapLive = { renderCount: number };

export function bumpRenderCount(live: RenderCapLive, label: string): void {
  live.renderCount += 1;
  if (live.renderCount > RENDER_CAP) {
    throw new Error(`render loop: ${label} rendered more than ${RENDER_CAP} times`);
  }
}

/** Flush microtasks inside `act` so in-flight probe / discovery effects can settle. */
export async function flushEffects(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

export const FOUR_REPOS = [
  "https://github.com/hive/MILO5",
  "https://github.com/hive/milo5-agentic",
  "https://github.com/hive/milo5-mocks",
  "https://github.com/hive/milo5-ops",
] as const;

export function authDiscoveryPayload() {
  return {
    sourceControlProviders: [
      {
        kind: "github",
        auth: {
          status: "authenticated" as const,
          host: "github.com",
          account: "yg",
          accounts: [{ host: "github.com", account: "yg", active: true, authenticated: true }],
        },
      },
    ],
  };
}

export function inboxPayload(urls: ReadonlyArray<string> = FOUR_REPOS) {
  return {
    host: "github.com",
    account: "yg",
    suggestedRepositoryUrls: [...urls],
    repositories: urls.map((url) => ({
      id: url,
      nameWithOwner: url.replace("https://github.com/", ""),
      url,
      host: "github.com",
    })),
  };
}
