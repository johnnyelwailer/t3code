import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { DigestClaim } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { render } from "../../test/render";
import { DigestAgentDots } from "./t3team-ProjectMyWorkDigestAgentDots";

const makeProvider = (instanceId: string, driver: string, displayName: string): ServerProvider => ({
  instanceId: ProviderInstanceId.make(instanceId),
  driver: ProviderDriverKind.make(driver),
  displayName,
  iconDataUrl: `data:image/svg+xml,${instanceId}`,
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-09-22T00:00:00Z",
  models: [],
  skills: [],
  slashCommands: [],
});
const providers = [
  makeProvider("nexplore", "nexplore", "Nexplore AI"),
  makeProvider("claude", "claudeAgent", "Claude"),
];

vi.mock(import("~/state/environments"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentProviders: () => new Map([[EnvironmentId.make("env"), providers]]),
}));
const NOW = Date.parse("2026-10-06T12:00:00Z");
const claim = (threadId: string, extra: Partial<DigestClaim> = {}): DigestClaim => ({
  threadId,
  threadTitle: `Thread ${threadId}`,
  ticketId: "IES-1",
  agent: "Codex · gpt-5.1",
  lastActivityAt: "2026-10-06T11:55:00Z",
  threadUrl: `/t3team/projects/p/threads/${threadId}`,
  ...extra,
});

const BADGE = "[data-t3team-digest-agent-badge]";
const ICON = "img[src^='data:image/svg+xml']";

describe("DigestAgentDots", () => {
  it("stacked: renders plain dots and no provider icons", async () => {
    await using screen = await render(
      <DigestAgentDots
        claims={[claim("a", { providerInstanceId: "nexplore" })]}
        nowMs={NOW}
        variant="stacked"
      />,
      { router: false },
    );
    expect(screen.container.querySelectorAll(ICON)).toHaveLength(0);
    expect(screen.container.querySelectorAll(BADGE)).toHaveLength(0);
    expect(screen.container.querySelectorAll(".size-2\\.5").length).toBeGreaterThan(0);
  });

  it("badges: shows each claim's real provider icon", async () => {
    await using screen = await render(
      <DigestAgentDots
        claims={[
          claim("a", { providerInstanceId: "nexplore" }),
          claim("b", { providerInstanceId: "claude" }),
        ]}
        nowMs={NOW}
        variant="badges"
      />,
      { router: false },
    );
    const icons = [...screen.container.querySelectorAll(ICON)].map((icon) =>
      icon.getAttribute("src"),
    );
    expect(icons).toEqual(["data:image/svg+xml,nexplore", "data:image/svg+xml,claude"]);
  });

  it("badges: falls back to the bot glyph for an unresolvable agent", async () => {
    await using screen = await render(
      <DigestAgentDots
        claims={[claim("a"), claim("b", { providerInstanceId: "removed-instance" })]}
        nowMs={NOW}
        variant="badges"
      />,
      { router: false },
    );
    expect(screen.container.querySelectorAll(ICON)).toHaveLength(0);
    expect(screen.container.querySelectorAll(BADGE)).toHaveLength(2);
  });

  it("badges keep the thread link, tooltip text, freshness and the three-badge cap", async () => {
    const claims = ["a", "b", "c", "d", "e"].map((id) =>
      claim(id, { providerInstanceId: "nexplore", ...(id === "a" ? { running: true } : {}) }),
    );
    await using screen = await render(
      <DigestAgentDots claims={claims} nowMs={NOW} variant="badges" />,
      { router: false },
    );
    const links = [...screen.container.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/t3team/projects/p/threads/a",
      "/t3team/projects/p/threads/b",
      "/t3team/projects/p/threads/c",
    ]);
    expect(links[0]?.getAttribute("aria-label")).toBe("Thread a · working 5 min ago");
    expect(links[1]?.getAttribute("aria-label")).toBe("Thread b · updated 5 min ago");
    const states = [...screen.container.querySelectorAll(BADGE)].map((badge) =>
      badge.getAttribute("data-t3team-state"),
    );
    expect(states).toEqual(["fresh", "fresh", "fresh"]);
    await expect.element(screen.getByText("+2")).toBeInTheDocument();
  });
});
