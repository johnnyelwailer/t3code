import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComposerDraft } from "../state/use-composer-drafts";

const getComposerDraftSnapshot = vi.hoisted(() =>
  vi.fn((draftKey: string): ComposerDraft => {
    void draftKey;
    return {
      text: "",
      attachments: [],
      project: {
        environmentId: EnvironmentId.make("env-a"),
        projectId: ProjectId.make("p-b"),
        createdAt: "2026-11-05T00:00:00.000Z",
      },
    };
  }),
);
vi.mock("../state/use-composer-drafts", () => ({ getComposerDraftSnapshot }));

import { draftProjectStamp } from "./t3team-usePendingDraft";

describe("draftProjectStamp", () => {
  it("reads the draft's stamp as plain ids", () => {
    expect(draftProjectStamp("draft-1")).toEqual({ environmentId: "env-a", projectId: "p-b" });
    expect(getComposerDraftSnapshot).toHaveBeenCalledExactlyOnceWith("draft-1");
  });

  it("is null for a draft without a stamp", () => {
    getComposerDraftSnapshot.mockReturnValueOnce({ text: "", attachments: [], project: undefined });
    expect(draftProjectStamp("draft-1")).toBeNull();
  });
});
