import { describe, expect, it, vi } from "vite-plus/test";

import { ExtensionBoundary } from "./t3team-ExtensionBoundary";

describe("ExtensionBoundary", () => {
  it("renders the slot, and after a failure the fallback (default: nothing)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onFailure = vi.fn();
    const boundary = new ExtensionBoundary({ children: "slot", fallback: "stock", onFailure });
    expect(boundary.render()).toBe("slot");
    boundary.state = ExtensionBoundary.getDerivedStateFromError();
    expect(boundary.render()).toBe("stock");
    boundary.componentDidCatch(new Error("boom"));
    expect(onFailure).toHaveBeenCalledTimes(1);
    const bare = new ExtensionBoundary({ children: "slot" });
    bare.state = { failed: true };
    expect(bare.render()).toBeNull();
    warn.mockRestore();
  });
});
