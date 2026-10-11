import { describe, expect, it } from "vite-plus/test";

import type { ServerConfig } from "@t3tools/contracts";

import { isT3TeamMyWorkRightPanelEnabled } from "./t3team-myWorkRightPanelFlag";

describe("isT3TeamMyWorkRightPanelEnabled", () => {
  it("defaults on when the server omits the field", () => {
    expect(isT3TeamMyWorkRightPanelEnabled({} as ServerConfig)).toBe(true);
    expect(isT3TeamMyWorkRightPanelEnabled(null)).toBe(true);
  });

  it("honours an explicit off from the server", () => {
    expect(isT3TeamMyWorkRightPanelEnabled({ myWorkRightPanel: false } as ServerConfig)).toBe(
      false,
    );
  });

  it("honours an explicit on from the server", () => {
    expect(isT3TeamMyWorkRightPanelEnabled({ myWorkRightPanel: true } as ServerConfig)).toBe(true);
  });
});
