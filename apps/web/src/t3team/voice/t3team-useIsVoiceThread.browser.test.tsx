import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { useIsVoiceThread } from "./t3team-useIsVoiceThread";
import { useVoiceThreadStore } from "./t3team-voiceThreadStore";

const flags = vi.hoisted(() => ({ voiceSessions: false }));
vi.mock(import("~/t3team/t3team-useFeatureFlag"), async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: () => flags.voiceSessions,
}));

function Probe() {
  return <span>{useIsVoiceThread("env-1", "voice-thread") ? "voice" : "ordinary"}</span>;
}

describe("the voice thread behind VOICE_SESSIONS", () => {
  it("is an ordinary thread while voice sessions are off, and the voice thread once on", async () => {
    await act(() =>
      useVoiceThreadStore.getState().remember("env-1", {
        threadId: ThreadId.make("voice-thread"),
        projectId: ProjectId.make("project-1"),
      }),
    );
    {
      await using screen = await render(<Probe />, { router: false });
      await expect.element(screen.getByText("ordinary")).toBeInTheDocument();
    }
    flags.voiceSessions = true;
    await using screen = await render(<Probe />, { router: false });
    await expect.element(screen.getByText("voice")).toBeInTheDocument();
  });
});
