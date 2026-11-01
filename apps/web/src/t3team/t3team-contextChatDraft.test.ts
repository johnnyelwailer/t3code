import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const shells = vi.hoisted(() => ({ existing: new Set<string>() }));
vi.mock("~/state/entities", () => ({
  readThreadShell: (ref: { threadId: string }) => (shells.existing.has(ref.threadId) ? {} : null),
}));

import { useComposerDraftStore } from "~/composerDraftStore";
import { contextChatBindingKey, myWorkContextBinding } from "./t3team-contextChatBinding";
import { ensureContextChatDraft } from "./t3team-contextChatDraft";

const ENVIRONMENT = EnvironmentId.make("env-1");
const SCRATCH = ProjectId.make("scratch");
const projectRef = scopeProjectRef(ENVIRONMENT, SCRATCH);
const bindingKey = contextChatBindingKey(ENVIRONMENT, myWorkContextBinding(SCRATCH));

beforeEach(() => {
  shells.existing.clear();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
});

describe("contextChatBindingKey", () => {
  it("has no colon, which the draft store would read as <environment>:<project>", () => {
    expect(bindingKey).not.toContain(":");
    expect(
      contextChatBindingKey(ENVIRONMENT, myWorkContextBinding(ProjectId.make("other"))),
    ).not.toBe(bindingKey);
  });
});

describe("ensureContextChatDraft", () => {
  it("opens one draft per binding and hands the same one back", () => {
    const first = ensureContextChatDraft({ projectRef, bindingKey });
    expect(ensureContextChatDraft({ projectRef, bindingKey })).toEqual(first);
    const stored = useComposerDraftStore.getState().getDraftSession(first.draftId);
    expect(stored).toMatchObject({
      threadId: first.threadId,
      projectId: SCRATCH,
      logicalProjectKey: bindingKey,
      promotedTo: null,
    });
    expect(Object.keys(useComposerDraftStore.getState().draftThreadsByThreadKey)).toHaveLength(1);
  });

  it("starts a fresh draft once the previous one's thread reached the server", () => {
    const first = ensureContextChatDraft({ projectRef, bindingKey });
    shells.existing.add(first.threadId);
    const second = ensureContextChatDraft({ projectRef, bindingKey });
    expect(second.draftId).not.toBe(first.draftId);
    expect(second.threadId).not.toBe(first.threadId);
  });

  it("keeps the binding's draft apart from the project's own new-thread draft", () => {
    const projectDraft = useComposerDraftStore.getState();
    projectDraft.setProjectDraftThreadId(projectRef, "draft-project" as never, {
      threadId: "thread-project" as never,
    });
    const chat = ensureContextChatDraft({ projectRef, bindingKey });
    const mapping =
      useComposerDraftStore.getState().logicalProjectDraftThreadKeyByLogicalProjectKey;
    expect(mapping[bindingKey]).toBe(chat.draftId);
    expect(Object.values(mapping)).toContain("draft-project");
  });
});
