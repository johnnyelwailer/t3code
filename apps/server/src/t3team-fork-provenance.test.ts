/**
 * Pure tests for the fork provenance note: provider/model transition
 * rendering, name resolution fallbacks, and the note text shape.
 */
import { ModelSelection, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  forkModelSelectionLabel,
  forkModelTransition,
  forkProvenanceNote,
} from "./t3team-fork-provenance.ts";

const CLAUDE: ModelSelection = {
  instanceId: ProviderInstanceId.make("claude"),
  model: "claude-opus-4",
};
const NEXPLOR: ModelSelection = {
  instanceId: ProviderInstanceId.make("nexplore"),
  model: "gpt-5",
};

const snapshots = [
  {
    instanceId: ProviderInstanceId.make("claude"),
    displayName: "Claude",
    models: [{ slug: "claude-opus-4", name: "Opus 4" }],
  },
  {
    instanceId: ProviderInstanceId.make("nexplore"),
    displayName: "Nexplore AI",
    models: [{ slug: "gpt-5", name: "GPT-5" }],
  },
] as unknown as ReadonlyArray<ServerProvider>;

describe("forkModelSelectionLabel", () => {
  it("renders the display name and model name when both resolve", () => {
    expect(forkModelSelectionLabel(CLAUDE, snapshots)).toBe("Claude (Opus 4)");
  });

  it("falls back to the raw instance id and model slug when unresolvable", () => {
    expect(forkModelSelectionLabel(CLAUDE, [])).toBe("claude (claude-opus-4)");
    // Provider resolves but the model slug does not: the slug stands in.
    expect(
      forkModelSelectionLabel({ instanceId: CLAUDE.instanceId, model: "unknown-model" }, snapshots),
    ).toBe("Claude (unknown-model)");
  });
});

describe("forkModelTransition", () => {
  it("states a different provider and model as an arrow when both resolve", () => {
    expect(forkModelTransition(CLAUDE, NEXPLOR, snapshots)).toBe(
      "Claude (Opus 4) \u2192 Nexplore AI (GPT-5)",
    );
  });

  it("states an unchanged selection once, deterministically", () => {
    expect(forkModelTransition(CLAUDE, CLAUDE, snapshots)).toBe(
      "model selection unchanged: Claude (Opus 4)",
    );
  });

  it("falls back to raw ids when no snapshot resolves either side", () => {
    expect(forkModelTransition(CLAUDE, NEXPLOR, [])).toBe(
      "claude (claude-opus-4) \u2192 nexplore (gpt-5)",
    );
  });

  it("returns undefined when the parent has no selection of its own", () => {
    expect(forkModelTransition(undefined, NEXPLOR, snapshots)).toBeUndefined();
  });
});

describe("forkProvenanceNote", () => {
  it("embeds the transition in parentheses after the first sentence", () => {
    const note = forkProvenanceNote({
      parentTitle: "Parent thread",
      omittedMessageCount: 8,
      modelTransition: "Claude (Opus 4) \u2192 Nexplore AI (GPT-5)",
    });
    expect(note).toBe(
      "This thread was forked from \u201cParent thread\u201d " +
        "(Claude (Opus 4) \u2192 Nexplore AI (GPT-5)). " +
        "8 middle messages of the original conversation were omitted to keep this thread's context " +
        "small. Use the t3team.thread.search_source tool to look anything up from the omitted range, " +
        "or open the original thread for the full history.",
    );
  });

  it("keeps the original shape when the transition is omitted", () => {
    const note = forkProvenanceNote({
      parentTitle: "Parent thread",
      omittedMessageCount: 1,
      modelTransition: undefined,
    });
    expect(note).toBe(
      "This thread was forked from \u201cParent thread\u201d. 1 middle message of the original " +
        "conversation were omitted to keep this thread's context small. Use the " +
        "t3team.thread.search_source tool to look anything up from the omitted range, " +
        "or open the original thread for the full history.",
    );
  });
});
