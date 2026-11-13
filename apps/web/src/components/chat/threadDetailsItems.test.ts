import { describe, expect, it } from "vite-plus/test";

import {
  isDefaultThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  resolveThreadDetailsVisibility,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

const usage = THREAD_DETAILS_ITEMS.find((item) => item.id === "usage")!;
const servers = THREAD_DETAILS_ITEMS.find((item) => item.id === "servers")!;

describe("thread details items", () => {
  it("shows Usage limits by default and keeps Context hidden", () => {
    expect(usage.defaultVisible).toBe(true);
    expect(THREAD_DETAILS_ITEMS.find((item) => item.id === "context")!.defaultVisible).toBe(false);
  });

  it.each([
    { legacy: false, items: {}, usage: true, context: false },
    { legacy: true, items: {}, usage: true, context: true },
    { legacy: true, items: { usage: false }, usage: false, context: true },
    { legacy: false, items: { usage: true, retired: false }, usage: true, context: false },
    { legacy: false, items: { usage: false }, usage: false, context: false },
  ])("resolves Usage and Context from overrides and the retired Labs flag: %o", (row) => {
    const visibility = resolveThreadDetailsVisibility({
      threadDetailsItems: row.items,
      threadDetailsUsageEnabled: row.legacy,
    });
    expect(visibility.usage).toBe(row.usage);
    expect(visibility.context).toBe(row.context);
    expect(visibility.servers).toBe(true);
  });

  it("stores only choices that differ from the default", () => {
    const legacyOn = { threadDetailsItems: {}, threadDetailsUsageEnabled: true };
    expect(setThreadDetailsItem(legacyOn, usage, false)).toEqual({ usage: false });
    expect(setThreadDetailsItem(legacyOn, usage, true)).toEqual({});

    const defaults = { threadDetailsItems: {}, threadDetailsUsageEnabled: false };
    expect(setThreadDetailsItem(defaults, usage, true)).toEqual({});
    expect(setThreadDetailsItem(defaults, usage, false)).toEqual({ usage: false });

    const hidden = { threadDetailsItems: { servers: false }, threadDetailsUsageEnabled: false };
    expect(setThreadDetailsItem(hidden, servers, true)).toEqual({});
  });

  it("treats the new Usage-visible defaults as the reset baseline", () => {
    const visibility = resolveThreadDetailsVisibility({
      threadDetailsItems: RESET_THREAD_DETAILS_ITEMS.threadDetailsItems,
      threadDetailsUsageEnabled: RESET_THREAD_DETAILS_ITEMS.threadDetailsUsageEnabled,
    });
    expect(visibility.usage).toBe(true);
    expect(visibility.context).toBe(false);
    expect(isDefaultThreadDetailsVisibility(visibility)).toBe(true);
  });
});
