import { describe, expect, it } from "vite-plus/test";
import { parsePersistedState, setThreadIcon, type PersistedUiState } from "./uiStateStore";
import { sanitizeThreadIconRecord, withThreadIcon } from "./t3team-threadIconRecord";

describe("sanitizeThreadIconRecord", () => {
  it("keeps valid emoji, lucide and monogram icons", () => {
    const record = {
      "thread-a": { kind: "emoji", emoji: "🤖" },
      "thread-b": { kind: "lucide", name: "terminal", color: "blue" },
      "thread-c": { kind: "monogram", text: "NX", color: "blue" },
    };
    expect(sanitizeThreadIconRecord(record)).toEqual(record);
  });

  it("drops malformed entries and non-object input", () => {
    expect(
      sanitizeThreadIconRecord({
        "thread-a": { kind: "emoji" },
        "thread-b": "not-an-icon",
        "": { kind: "emoji", emoji: "🤖" },
        "thread-c": { kind: "emoji", emoji: "🔥" },
      }),
    ).toEqual({ "thread-c": { kind: "emoji", emoji: "🔥" } });
    expect(sanitizeThreadIconRecord(null)).toEqual({});
    expect(sanitizeThreadIconRecord("icons")).toEqual({});
  });
});

describe("thread icon persistence across restart", () => {
  it("restores a chosen icon from the serialized ui-state blob", () => {
    const chosen = setThreadIcon(parsePersistedState({}), "thread-a", {
      kind: "lucide",
      name: "mic",
      color: "blue",
    });
    const persisted: PersistedUiState = JSON.parse(
      JSON.stringify({ threadIconByThreadId: chosen.threadIconByThreadId }),
    );
    expect(parsePersistedState(persisted).threadIconByThreadId).toEqual({
      "thread-a": { kind: "lucide", name: "mic", color: "blue" },
    });
  });
});

describe("withThreadIcon", () => {
  it("sets the icon for one thread without touching the others", () => {
    const before = { "thread-a": { kind: "emoji" as const, emoji: "🤖" } };
    const after = withThreadIcon(before, "thread-b", { kind: "emoji", emoji: "🔥" });
    expect(after).toEqual({
      "thread-a": { kind: "emoji", emoji: "🤖" },
      "thread-b": { kind: "emoji", emoji: "🔥" },
    });
    expect(before).not.toHaveProperty("thread-b");
  });
});
