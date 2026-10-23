import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";
import { useEffect, useRef } from "react";
import { describe, expect, it } from "vite-plus/test";

import { act, render } from "../../test/render";
import { useVoiceSessionOwnership } from "./t3team-useVoiceSessionOwnership";

class FakeController {
  phase: VoiceInputPhase = "idle";
  readonly calls: string[] = [];
  syncSlot: (phase: VoiceInputPhase) => void = () => {};
  get currentState() {
    return { phase: this.phase };
  }
  setPhase(next: VoiceInputPhase) {
    this.phase = next;
    this.syncSlot(next);
  }
  ownerChanged() {
    this.calls.push("ownerChanged");
    this.setPhase("idle");
  }
  stop() {
    this.calls.push("stop");
    this.setPhase("idle");
    return Promise.resolve();
  }
  cancel() {
    this.calls.push("cancel");
    this.setPhase("idle");
  }
}

function Recorder(props: {
  readonly controller: FakeController;
  readonly sessionKey: string;
  readonly onSyncSlot: (syncSlot: (phase: VoiceInputPhase) => void) => void;
}) {
  const { controller, sessionKey, onSyncSlot } = props;
  const ref = useRef<FakeController | null>(controller);
  const syncSlot = useVoiceSessionOwnership(ref, sessionKey);
  useEffect(() => onSyncSlot(syncSlot), [onSyncSlot, syncSlot]);
  return null;
}

function recorder(controller: FakeController, sessionKey: string) {
  const onSyncSlot = (syncSlot: (phase: VoiceInputPhase) => void) => {
    controller.syncSlot = syncSlot;
  };
  return <Recorder controller={controller} sessionKey={sessionKey} onSyncSlot={onSyncSlot} />;
}

describe("useVoiceSessionOwnership", () => {
  it("cancels a recording in progress when the composer is re-pointed at another thread", async () => {
    const controller = new FakeController();
    await using screen = await render(recorder(controller, "thread-a"), {
      router: false,
    });
    await act(() => controller.setPhase("recording"));

    await screen.rerender(recorder(controller, "thread-b"));

    expect(controller.calls).toEqual(["ownerChanged"]);
    expect(controller.phase).toBe("idle");
  });

  it("leaves a recording alone while the thread stays the same", async () => {
    const controller = new FakeController();
    await using screen = await render(recorder(controller, "thread-a"), {
      router: false,
    });
    await act(() => controller.setPhase("recording"));

    await screen.rerender(recorder(controller, "thread-a"));

    expect(controller.calls).toEqual([]);
    expect(controller.phase).toBe("recording");
  });

  it("ends the running recorder when a second one starts, so only one stays live", async () => {
    const first = new FakeController();
    const second = new FakeController();
    await using _first = await render(recorder(first, "thread-a"), {
      router: false,
    });
    await using _second = await render(recorder(second, "thread-b"), {
      router: false,
    });
    await act(() => first.setPhase("recording"));

    await act(() => second.setPhase("preparing"));

    expect(first.calls).toEqual(["stop"]);
    expect(first.phase).toBe("idle");
    expect(second.phase).toBe("preparing");
  });

  it("cancels a recorder that is still preparing when another one takes the microphone", async () => {
    const first = new FakeController();
    const second = new FakeController();
    await using _first = await render(recorder(first, "thread-a"), {
      router: false,
    });
    await using _second = await render(recorder(second, "thread-b"), {
      router: false,
    });
    await act(() => first.setPhase("preparing"));

    await act(() => second.setPhase("recording"));

    expect(first.calls).toEqual(["cancel"]);
  });
});
