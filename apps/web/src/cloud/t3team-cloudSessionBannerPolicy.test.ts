import { describe, expect, it } from "vite-plus/test";

import {
  applyCloudSessionBannerPolicy,
  withLiveSetupCard,
} from "./t3team-cloudSessionBannerPolicy";
import { resolveCloudSessionVisibleStatus } from "./t3team-cloudSessionVisibleStatus";
import { tlcTraces } from "./t3team-cloudSessionVisibleStatus.fixtures";

const ENV = "env-cloud";

function stack(ids: string[]) {
  return ids.map((id) => ({ id }));
}

const BANNERS_0832 = stack([
  `cloud-session-ended:${ENV}`,
  `cloud-project-clone:${ENV}:proj-1`,
  `environment-unavailable:${ENV}`,
  "provider-fallback:codex",
  "cloud-session-bind:msg-1",
]);

const BANNERS_0827 = stack([
  `cloud-session-ended:${ENV}`,
  `environment-unavailable:${ENV}`,
  "cloud-session-bind:msg-1",
]);

describe("applyCloudSessionBannerPolicy", () => {
  it("08:27 after: ended + setting-up keeps only the setup card (no ended, no offline, no bind)", () => {
    const last = tlcTraces["phil-0827"].at(-1)!;
    const status = resolveCloudSessionVisibleStatus(last.facts);
    const after = applyCloudSessionBannerPolicy(BANNERS_0827, status);
    expect(status.visible).toEqual(["setup"]);
    expect(after.map((i) => i.id)).toEqual([]);
  });

  it("08:32 after: ended + setting-up + Add to machine keeps only the setup card", () => {
    const last = tlcTraces["phil-0832"].at(-1)!;
    const status = resolveCloudSessionVisibleStatus(last.facts);
    const after = applyCloudSessionBannerPolicy(BANNERS_0832, status);
    expect(status.visible).toEqual(["setup"]);
    expect(status.showCloneBanner).toBe(false);
    expect(after.map((i) => i.id)).toEqual(["provider-fallback:codex"]);
  });

  it("leaves the ended banner when that is the one status (nothing queued)", () => {
    const status = resolveCloudSessionVisibleStatus({
      phase: "stopped",
      endedSticky: true,
      startingAnother: false,
      queued: "none",
      failureKind: "session_ended",
      machineConnected: false,
      projectReady: false,
      providerReady: false,
      cloneSuggested: false,
      conn: "blocked",
    });
    const after = applyCloudSessionBannerPolicy(BANNERS_0827, status);
    expect(status.visible).toEqual(["ended"]);
    expect(after.map((i) => i.id)).toEqual([`cloud-session-ended:${ENV}`]);
  });

  it("does not touch a provider-fallback banner (no silent model switch)", () => {
    const status = resolveCloudSessionVisibleStatus({
      phase: "ready",
      endedSticky: false,
      startingAnother: false,
      queued: "none",
      failureKind: "none",
      machineConnected: true,
      projectReady: true,
      providerReady: true,
      cloneSuggested: false,
      conn: "live",
    });
    const after = applyCloudSessionBannerPolicy(
      stack(["provider-fallback:codex", "usage-limits"]),
      status,
    );
    expect(after.map((i) => i.id)).toEqual(["provider-fallback:codex", "usage-limits"]);
  });

  it("if the live setup card is on screen but facts lag, banners still drop", () => {
    const lagging = resolveCloudSessionVisibleStatus({
      phase: "stopped",
      endedSticky: true,
      startingAnother: false,
      queued: "none",
      failureKind: "session_ended",
      machineConnected: false,
      projectReady: false,
      providerReady: false,
      cloneSuggested: true,
      conn: "blocked",
    });
    expect(lagging.visible).toEqual(["ended"]);
    const status = withLiveSetupCard(lagging, true);
    expect(status.visible).toEqual(["setup"]);
    const after = applyCloudSessionBannerPolicy(BANNERS_0832, status);
    expect(after.map((i) => i.id)).toEqual(["provider-fallback:codex"]);
  });
});

/** Rendered-state descriptions for the 08:27 and 08:32 report (no screenshots). */
export const RENDERED_STATE = {
  "08:27": {
    before: {
      setupCard: {
        stage: "failed",
        title: "Still setting up",
        subtitle:
          "Your message is kept: retry, send it in the machine's own project, start a plain session, or cancel to edit it.",
      },
      banners: [
        {
          id: "cloud-session-ended:*",
          title: "This cloud session has ended",
          action: "Start another cloud session",
        },
      ],
    },
    after: {
      setupCard: {
        stage: "failed",
        title: "Still setting up",
        subtitle:
          "Your message is kept: retry, send it in the machine's own project, or cancel to edit it.",
        primary: "Try again",
      },
      banners: [],
    },
  },
  "08:32": {
    before: {
      setupCard: {
        stage: "working",
        currentStep: "Connecting to the cloud machine",
        primary: "none",
      },
      banners: [
        { id: "cloud-session-ended:*", title: "This cloud session has ended", action: "Starting…" },
        {
          id: "cloud-project-clone:*",
          title: "<project> is not on Cloud session yet",
          action: "Add to machine",
        },
      ],
    },
    after: {
      setupCard: {
        stage: "working",
        currentStep: "Connecting to the cloud machine",
        primary: "none",
      },
      banners: [],
    },
  },
} as const;

describe("rendered-state 08:27 and 08:32", () => {
  it("after has one status and no stale plain-session promise", () => {
    expect(RENDERED_STATE["08:27"].after.banners).toEqual([]);
    expect(RENDERED_STATE["08:27"].after.setupCard.primary).toBe("Try again");
    expect(RENDERED_STATE["08:27"].after.setupCard.subtitle.toLowerCase()).not.toContain(
      "start a plain session",
    );
    expect(RENDERED_STATE["08:32"].after.banners).toEqual([]);
    expect(RENDERED_STATE["08:32"].before.banners).toHaveLength(2);
  });
});
