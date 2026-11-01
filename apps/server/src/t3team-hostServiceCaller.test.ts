import { describe, expect, it } from "vite-plus/test";

import { hostServiceCaller } from "./t3team-hostServiceCaller.ts";

describe("hostServiceCaller", () => {
  it("is the desktop only for the desktop app's own bootstrap session", () => {
    expect(hostServiceCaller({ subject: "desktop-bootstrap" })).toEqual({ desktop: true });
  });

  it("is not the desktop for any other subject, however it looks", () => {
    for (const subject of [
      "owner",
      "one-time-token",
      "Desktop-Bootstrap",
      "desktop-bootstrap ",
      "",
      "mobile",
    ]) {
      expect(hostServiceCaller({ subject }), JSON.stringify(subject)).toEqual({ desktop: false });
    }
  });
});
