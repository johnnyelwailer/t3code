import { describe, expect, it } from "vite-plus/test";

import { VOICE_ROLE_PROMPT } from "./t3team-voiceRolePrompt";

describe("VOICE_ROLE_PROMPT", () => {
  it("makes the agent an orchestrator that names its tools and confirms destructive actions", () => {
    expect(VOICE_ROLE_PROMPT).toContain("never do the work yourself");
    expect(VOICE_ROLE_PROMPT).toContain("delegate_task");
    expect(VOICE_ROLE_PROMPT).toContain("watch_pull_request");
    expect(VOICE_ROLE_PROMPT).toMatch(
      /destructive or hard to undo[^.]*only after the user confirms through t3_ask_user/s,
    );
  });

  it("tells the agent where the per-utterance live state arrives", () => {
    expect(VOICE_ROLE_PROMPT).toContain("`live state` context entry");
  });
});
