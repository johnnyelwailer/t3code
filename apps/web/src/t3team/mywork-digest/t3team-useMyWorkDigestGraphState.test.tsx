// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  DIGEST_FIXTURE_NOW_MS,
  digestFixtureGraph,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { clearCachedDigestGraphsForTests } from "./t3team-digestGraphCache";
import {
  useMyWorkDigestGraphState,
  type MyWorkDigestGraphState,
} from "./t3team-useMyWorkDigestGraphState";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type Sink = {
  patch: (next: Partial<MyWorkDigestGraphState>) => void;
  graph: DigestGraph | null;
};

describe("useMyWorkDigestGraphState graph landing", () => {
  let container: HTMLDivElement;
  let root: Root;
  const sink: Sink = { patch: () => undefined, graph: null };

  function Probe() {
    const result = useMyWorkDigestGraphState("project|story");
    useEffect(() => {
      sink.patch = result.patch;
      sink.graph = result.state.graph;
    });
    return null;
  }
  const land = (graph: DigestGraph) =>
    act(() => {
      sink.patch({ graph });
    });
  const latest = () => sink.graph;
  const fresh = (): DigestGraph => structuredClone(digestFixtureGraph);

  beforeEach(() => {
    clearCachedDigestGraphsForTests();
    sink.graph = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("takes the first graph as it comes", () => {
    const first = fresh();
    land(first);

    expect(latest()).toBe(first);
  });

  it("keeps the very same graph when a round brings nothing new", () => {
    const first = fresh();
    land(first);
    land(fresh());

    expect(latest()).toBe(first);
  });

  it("keeps the tickets, claims and PRs when only the Jira sync time moved", () => {
    const first = fresh();
    land(first);
    land({ ...fresh(), jiraSyncedAt: new Date(DIGEST_FIXTURE_NOW_MS).toISOString() });

    const landed = latest();
    expect(landed).not.toBe(first);
    expect(landed?.tickets).toBe(first.tickets);
    expect(landed?.claims).toBe(first.claims);
    expect(landed?.changeRequests).toBe(first.changeRequests);
  });

  it("replaces only the ticket that changed", () => {
    const first = fresh();
    land(first);
    const base = fresh();
    land({
      ...base,
      tickets: base.tickets.map((ticket, index) =>
        index === 0 ? { ...ticket, status: "Done" } : ticket,
      ),
    });

    const landed = latest();
    expect(landed?.tickets[0]?.status).toBe("Done");
    expect(landed?.tickets[1]).toBe(first.tickets[1]);
  });
});
