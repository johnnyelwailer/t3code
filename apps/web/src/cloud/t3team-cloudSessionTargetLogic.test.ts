import { describe, expect, it } from "vite-plus/test";

import {
  cloudSessionSelectValue,
  parseCloudSessionSelectValue,
} from "./t3team-cloudSessionTargetLogic";

describe("cloudSessionTargetLogic", () => {
  it("round-trips the optimistic select sentinel", () => {
    expect(parseCloudSessionSelectValue(cloudSessionSelectValue("s-1"))).toBe("s-1");
    expect(parseCloudSessionSelectValue("env-local")).toBeNull();
  });
});
