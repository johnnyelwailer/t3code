import { describe, expect, it, vi, type Mock } from "vite-plus/test";

import { render } from "../../../test/render";
import { DesktopComposerVoiceInput } from "./t3team-DesktopComposerVoiceInput";

interface World {
  phase: "idle" | "recording";
  partial: string;
  toggle: Mock;
  cancel: Mock;
}

const world = vi.hoisted((): World => ({
  phase: "idle",
  partial: "",
  toggle: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("~/voice/t3team-useDesktopVoiceInput", () => ({
  useDesktopVoiceInput: () => ({
    available: true,
    state: { phase: world.phase, error: null, errorAction: null },
    downloadPercent: null,
    stream: { partial: world.partial, writing: 0, writingSinceMs: null },
    toggle: world.toggle,
    cancel: world.cancel,
    sessionId: () => null,
  }),
}));

function setup(phase: World["phase"], partial = "") {
  world.phase = phase;
  world.partial = partial;
  world.toggle = vi.fn();
  world.cancel = vi.fn();
}

describe("DesktopComposerVoiceInput", () => {
  it("records with cancel and finish controls, never a second stop square", async () => {
    setup("recording", "Bitte öffne das Board und prüfe den Release-Branch");
    await using screen = await render(
      <DesktopComposerVoiceInput onTranscript={() => {}} disabled={false} />,
    );
    const finish = screen.getByRole("button", { name: "Finish voice input" });
    const cancel = screen.getByRole("button", { name: "Cancel voice input" });
    await expect.element(finish).toBeVisible();
    await expect.element(cancel).toBeVisible();
    expect(finish.element().querySelector(".lucide-check")).not.toBeNull();
    expect(cancel.element().querySelector(".lucide-x")).not.toBeNull();
    expect(screen.container.querySelector(".lucide-square")).toBeNull();
    expect(screen.container.textContent).not.toContain("Stop");

    await finish.click();
    expect(world.toggle).toHaveBeenCalledTimes(1);
    await cancel.click();
    expect(world.cancel).toHaveBeenCalledTimes(1);
  });

  it("streams the heard words as the ghost, and an ellipsis before the first word", async () => {
    setup("recording");
    const onPartial = vi.fn();
    await using screen = await render(
      <DesktopComposerVoiceInput onTranscript={() => {}} onPartial={onPartial} disabled={false} />,
    );
    await expect.element(screen.getByRole("button", { name: "Finish voice input" })).toBeVisible();
    expect(onPartial).toHaveBeenLastCalledWith("…");
  });

  it("offers one mic button when idle", async () => {
    setup("idle");
    await using screen = await render(
      <DesktopComposerVoiceInput onTranscript={() => {}} disabled={false} />,
    );
    await expect.element(screen.getByRole("button", { name: "Dictate" })).toBeVisible();
    expect(screen.container.querySelectorAll("button")).toHaveLength(1);
  });
});
