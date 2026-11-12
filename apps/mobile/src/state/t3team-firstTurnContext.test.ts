import { CommandId, EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  projectComposerContextForProvider,
} from "@t3tools/shared/composerContextReferences";
import { deriveThreadTitleFromPrompt } from "../lib/projectThreadStartTurn";
import { describe, expect, it } from "vite-plus/test";

import { withFirstTurnContext } from "./t3team-firstTurnContext";
import type { QueuedThreadMessage } from "./thread-outbox-model";

const message: QueuedThreadMessage = {
  environmentId: EnvironmentId.make("machine"),
  threadId: ThreadId.make("thread"),
  commandId: CommandId.make("command"),
  messageId: MessageId.make("message"),
  text: "Fix the build",
  attachments: [],
  createdAt: "2026-11-09T00:00:00.000Z",
};
const notice = {
  label: "Cloud session notice",
  text: "The project “ies ng” is not on this machine yet; clone it.",
};

describe("withFirstTurnContext", () => {
  it("attaches the facts as a referenced context record, not as typed text", () => {
    const sent = withFirstTurnContext(message, notice);
    const [reference] = collectComposerContextReferences(sent.text);
    expect(reference).toMatchObject({ kind: "setup-note", label: "Cloud session notice" });
    expect(sent.text.startsWith("Fix the build\n\n")).toBe(true);
    expect(sent.context?.records).toEqual([
      expect.objectContaining({ kind: "setup-note", payload: notice.text }),
    ]);
  });

  it("gives the agent the facts in the turn's context envelope", () => {
    const sent = withFirstTurnContext(message, notice);
    const prompt = projectComposerContextForProvider({
      text: sent.text,
      records: sent.context!.records,
    });
    expect(prompt).toContain("Fix the build");
    expect(prompt).toContain('<context kind="setup-note" id="setup-note">');
    expect(prompt).toContain("is not on this machine yet; clone it.");
  });

  it("keeps the user's words as the thread title seed", () => {
    expect(deriveThreadTitleFromPrompt(withFirstTurnContext(message, notice).text)).toMatch(
      /^Fix the build/,
    );
  });

  it("keeps existing records and attaches the facts once", () => {
    const withFile = withFirstTurnContext(
      {
        ...message,
        context: {
          version: 1,
          records: [
            {
              version: 1,
              kind: "mention",
              contextId: "mention-1" as never,
              label: "a.ts",
              path: "a.ts",
            },
          ],
        },
      },
      notice,
    );
    const twice = withFirstTurnContext(withFile, notice);
    expect(twice).toBe(withFile);
    expect(twice.context?.records.map((record) => record.kind)).toEqual(["mention", "setup-note"]);
  });

  it("references the context again when a restored message lost the chip text", () => {
    const sent = withFirstTurnContext(message, notice);
    const withoutChip = { ...sent, text: "Fix the build" };
    const resent = withFirstTurnContext(withoutChip, notice);
    expect(collectComposerContextReferences(resent.text)).toHaveLength(1);
    expect(resent.context?.records).toHaveLength(1);
  });

  it("restores the record when the text still references it but the record was dropped", () => {
    const sent = withFirstTurnContext(message, notice);
    const { context: _dropped, ...withoutRecord } = sent;
    const resent = withFirstTurnContext(withoutRecord, notice);
    expect(resent.text).toBe(sent.text);
    expect(resent.context?.records).toEqual(sent.context?.records);
  });

  it("leaves the message alone without context or when the facts do not fit a record", () => {
    expect(withFirstTurnContext(message, undefined)).toBe(message);
    expect(withFirstTurnContext(message, { label: "x", text: "y".repeat(70_000) })).toBe(message);
  });
});
