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

  it("names only the consolidated queue, pending-request and configure tools", () => {
    expect(VOICE_ROLE_PROMPT).toContain("t3_queue (");
    expect(VOICE_ROLE_PROMPT).toContain("t3_pending_request (");
    expect(VOICE_ROLE_PROMPT).toContain("t3_thread_configure,");
    expect(VOICE_ROLE_PROMPT).not.toMatch(
      /t3_queue_(list|read)|t3_pending_request_(list|read|respond)|t3_thread_configuration/,
    );
  });

  it("tells the agent where the per-utterance live state arrives", () => {
    expect(VOICE_ROLE_PROMPT).toContain("`live state` context entry");
  });
});
