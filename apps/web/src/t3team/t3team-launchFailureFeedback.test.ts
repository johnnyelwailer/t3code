import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { surfaceRecipeLaunchOutcome } from "~/t3team/t3team-launchFailureFeedback";

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));

vi.mock("~/components/ui/toast", () => ({ toastManager: { add: toastAdd } }));

beforeEach(() => toastAdd.mockReset());

// Two microtask turns: the launch promise settles, then its handler runs.
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("surfaceRecipeLaunchOutcome", () => {
  it("toasts the error of a rejected launch and nothing for a successful one", async () => {
    surfaceRecipeLaunchOutcome(Promise.reject(new Error("The server refused the launch.")));
    surfaceRecipeLaunchOutcome(Promise.resolve(true));
    await flush();
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith({
      type: "error",
      title: "Could not start",
      description: "The server refused the launch.",
    });
  });

  it("toasts a launch that resolved false instead of dropping it silently", async () => {
    surfaceRecipeLaunchOutcome(Promise.resolve(false));
    await flush();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", title: "Could not start" }),
    );
  });
});
