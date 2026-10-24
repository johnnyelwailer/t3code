import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import {
  endedSessionBannerItem,
  withCloudSessionEndedBanner,
} from "./t3team-CloudSessionEndedBanner";

const item = (id: string): ComposerBannerStackItem => ({
  id,
  variant: "info",
  icon: null,
  title: id,
});

describe("endedSessionBannerItem", () => {
  it("carries the ended id, the production copy, and the caller's action", () => {
    const environmentId = EnvironmentId.make("env-1");
    const actions = <button type="button">Start</button>;
    const ended = endedSessionBannerItem(environmentId, actions);
    expect(ended.id).toBe("cloud-session-ended:env-1");
    expect(ended.variant).toBe("warning");
    expect(ended.title).toBe("This cloud session has ended");
    expect(ended.actions).toBe(actions);
  });
});

describe("withCloudSessionEndedBanner", () => {
  it("changes nothing when the session has not ended", () => {
    const items = [item("environment-unavailable:env-1"), item("thread-handoff")];
    expect(withCloudSessionEndedBanner(items, null)).toEqual(items);
  });

  it("replaces the generic 'is offline' notice with the ended banner, keeping the others", () => {
    const ended = item("cloud-session-ended:env-1");
    const result = withCloudSessionEndedBanner(
      [item("environment-unavailable:env-1"), item("thread-handoff")],
      ended,
    );
    expect(result.map((entry) => entry.id)).toEqual([
      "thread-handoff",
      "cloud-session-ended:env-1",
    ]);
  });
});
