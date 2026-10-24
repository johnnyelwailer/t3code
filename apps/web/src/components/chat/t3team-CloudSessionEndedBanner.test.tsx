import { describe, expect, it } from "vite-plus/test";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import { withCloudSessionEndedBanner } from "./t3team-CloudSessionEndedBanner";

const item = (id: string): ComposerBannerStackItem => ({
  id,
  variant: "info",
  icon: null,
  title: id,
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
