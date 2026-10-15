import { describe, expect, it, vi } from "vite-plus/test";

import { ProviderDriverKind } from "@t3tools/contracts";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("../../state/queries", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
  useComposerPullRequestSearch: () => ({ entries: [], isPending: false, error: null }),
}));
vi.mock("../../state/use-composer-drafts", () => ({
  getComposerDraftSnapshot: vi.fn(),
  readComposerDraftSelection: vi.fn(),
  setComposerDraftContext: vi.fn(),
}));
vi.mock("../../lib/uuid", () => ({ uuidv4: () => "context-id" }));
vi.mock("../../state/server", () => ({ serverEnvironment: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));

import {
  buildComposerSlashCommandItems,
  resolveComposerCommandSelection,
} from "./use-composer-command-menu";

function slashItems(driver: string, query: string, atMessageStart = true) {
  return buildComposerSlashCommandItems({
    query,
    atMessageStart,
    hasThread: true,
    allowInteractionMode: false,
    selectedProviderStatus: {
      driver: ProviderDriverKind.make(driver),
      slashCommands: [],
      showInteractionModeToggle: false,
    },
  });
}

describe("Nexi Work recipes in the slash menu", () => {
  it("offers the pack's recipes by alias or title when Nexplore AI is selected", () => {
    expect(slashItems("nexplore", "needs").map((item) => item.label)).toEqual(["/needs-me"]);
    expect(slashItems("nexplore", "retro").map((item) => item.label)).toEqual(["/retro"]);
    expect(slashItems("nexplore", "").filter((item) => item.type === "recipe")).toHaveLength(10);
  });

  it("hides recipes for other providers and mid-message", () => {
    expect(slashItems("codex", "needs")).toEqual([]);
    expect(slashItems("nexplore", "needs", false)).toEqual([]);
  });

  it("turns a picked recipe into a run request naming its id", () => {
    const [item] = slashItems("nexplore", "needs");
    if (!item) throw new Error("expected the needs-me recipe");

    const selection = resolveComposerCommandSelection({
      draftMessage: "/needs",
      trigger: { rangeStart: 0, rangeEnd: 6 },
      item,
      allowInteractionMode: false,
    });

    expect(selection.text).toBe("Run recipe whats-needing-me („Was braucht mich?“). ");
    expect(selection.interactionMode).toBeNull();
  });
});
