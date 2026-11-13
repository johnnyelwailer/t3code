// @vitest-environment jsdom
import { type ToolAuthState, type ToolAuthToolId } from "@t3tools/contracts";
import { act, memo, useSyncExternalStore, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { renderCounter } from "~/test/t3team-renderCounter";

import { ToolAuthCard } from "./t3team-ToolAuthCard";
import { toolAuthMetaForTool } from "./t3team-toolAuthTools";

/**
 * Budget for the settings tool-auth cards: the list re-renders on its own clock, but each card
 * bails out unless its own auth state changed. Counts come from a memoized wrapper per card,
 * via renderCounter. The list keeps the store subscription and hands every card stable props.
 */
const CLAUDE_CONNECTED: ToolAuthState = {
  tool: "claude",
  phase: "connected",
  account: "ada@nexplore.com",
};
// Stable idle references: a card that never saw a state must keep the same prop object across
// list re-renders, or its memo barrier would spuriously let the card re-render.
const CODEX_IDLE: ToolAuthState = { tool: "codex", phase: "idle" };
const GH_IDLE: ToolAuthState = { tool: "gh", phase: "idle" };
const CODEX_CONNECTED: ToolAuthState = {
  tool: "codex",
  phase: "connected",
  account: "ada@nexplore.com",
};

const TOOLS = ["claude", "codex", "gh"] as const;
const FALLBACK: Record<ToolAuthToolId, ToolAuthState> = {
  claude: CLAUDE_CONNECTED,
  codex: CODEX_IDLE,
  gh: GH_IDLE,
};

type States = ReadonlyMap<ToolAuthToolId, ToolAuthState>;

const store = {
  current: new Map<ToolAuthToolId, ToolAuthState>([["claude", CLAUDE_CONNECTED]]) as States,
  listeners: new Set<() => void>(),
  set(next: States) {
    store.current = next;
    for (const listener of store.listeners) listener();
  },
  subscribe(listener: () => void) {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },
};

const noop = () => {};
const counter = renderCounter();

// Same barrier shape as the settings list: stable props, bail out when only siblings change.
const CountingCard = memo(function CountingCard(props: {
  readonly tool: ToolAuthToolId;
  readonly state: ToolAuthState;
}) {
  counter.count(props.tool);
  return (
    <ToolAuthCard
      meta={toolAuthMetaForTool(props.tool)}
      state={props.state}
      machineLabel="this cloud machine"
      onConnect={noop}
      onSubmitCode={noop}
      onCancel={noop}
    />
  );
});

function Harness() {
  const [tick, setTick] = useState(0);
  const states = useSyncExternalStore(store.subscribe, () => store.current);
  return (
    <div>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        tick {tick}
      </button>
      {TOOLS.map((tool) => (
        <CountingCard key={tool} tool={tool} state={states.get(tool) ?? FALLBACK[tool]} />
      ))}
    </div>
  );
}

describe("ToolAuthCard re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    store.current = new Map<ToolAuthToolId, ToolAuthState>([["claude", CLAUDE_CONNECTED]]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    counter.reset();
  });

  it("mounts every card once and shows the connected account", async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    expect(container.textContent).toContain("Signed in as ada@nexplore.com");
    expect(container.querySelectorAll("[data-testid='toolauth-primary-action']")).toHaveLength(2);
    counter.expectRerendered({ claude: 1, codex: 1, gh: 1 });
  });

  it("sits out the list's own clock", async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    counter.reset();
    await act(async () => {
      container.querySelector("button")!.click();
    });
    counter.expectRerendered({});
  });

  it("re-renders once when its own auth state changes", async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    counter.reset();
    await act(async () => {
      store.set(
        new Map([
          ["claude", CLAUDE_CONNECTED],
          ["codex", CODEX_CONNECTED],
        ]),
      );
    });
    counter.expectRerendered({ codex: 1 });
    // Only the still-idle gh card keeps its primary action; codex now shows its account.
    expect(container.querySelectorAll("[data-testid='toolauth-primary-action']")).toHaveLength(1);
  });
});
