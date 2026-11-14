import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const toasts = vi.hoisted(() => {
  const added: unknown[] = [];
  return { added };
});
vi.mock("~/components/ui/toast", () => ({
  toastManager: {
    add: (toast: unknown) => {
      toasts.added.push(toast);
      return "toast-1";
    },
    close: () => undefined,
  },
}));

import { reportCloudSessionMachineFallback } from "./t3team-cloudSessionFailure";

describe("the line a plain fallback shows", () => {
  beforeEach(() => {
    toasts.added = [];
  });

  it("says once why the project's machine was not used", () => {
    reportCloudSessionMachineFallback({
      machineFallback: "Commit and push the machine definition.",
    });
    expect(toasts.added).toEqual([
      {
        type: "info",
        title: "Started without the project's machine",
        description: "Commit and push the machine definition.",
      },
    ]);
  });

  it("says nothing when the machine was used", () => {
    reportCloudSessionMachineFallback({});
    expect(toasts.added).toEqual([]);
  });
});
