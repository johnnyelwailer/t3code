// @vitest-environment jsdom
/**
 * The host slots end to end against the app registry: a registered pack view renders, an empty slot
 * renders nothing, and a view that throws takes only itself down. The registry is one per page, so
 * the tests that need it empty run first.
 */
import { defineWebActivate } from "@t3team/pack-ui/contract";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DashboardWidget } from "~/t3team/t3team-dashboardWidgetRegistry";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { DigestPrChips } from "~/t3team/t3team-ProjectMyWorkDigestPrChips";
import {
  getT3TeamSidecarSectionComponent,
  listT3TeamSidecarSections,
} from "~/t3team/t3team-sidecarSectionRegistry";

import { changeRequestSummaryResetKeys } from "./t3team-ViewSlot";
import { activateAppViewPacks } from "./t3team-appViewRegistry";
import { ChangeRequestSummarySlot } from "./t3team-changeRequestSlots";
import { usePackScope } from "./t3team-packScope";
import { brokenPackWebModule, ciInsightsPackWebModule } from "./t3team-slotsPackFixtures";
import type { PullRequestDetailView, PullRequestRef } from "@t3tools/contracts";
import { ProjectId } from "@t3tools/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // React reports a caught render error to the console; the boundary is what is under test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const render = (node: ReactNode) => act(() => root.render(node));

const reference: PullRequestRef = {
  projectId: ProjectId.make("project"),
  repository: "acme/app",
  number: 7,
};
const detail = {
  state: "open",
  headSha: "abc123",
  baseSha: "def456",
  author: { login: "Author", name: null, avatarUrl: null },
  viewer: "author",
} as unknown as PullRequestDetailView;

const pr = {
  id: "github.com:acme/app#7",
  ticketId: "NEX-1",
  repo: "acme/app",
  number: 7,
  state: "open",
  reviewers: [],
  updatedAt: "2026-10-01T00:00:00.000Z",
} as const;

describe("with nothing registered", () => {
  it("renders no node for the Summary slot and none beside a digest chip", () => {
    render(<ChangeRequestSummarySlot reference={reference} detail={detail} />);
    expect(container.innerHTML).toBe("");

    // The chip alone: the slot adds no sibling, so the chip row is exactly what it was.
    render(<DigestPrChips prs={[pr]} />);
    const chipRow = container.firstElementChild!;
    expect(chipRow.children).toHaveLength(1);
    expect(chipRow.firstElementChild!.tagName).toBe("A");
  });
});

describe("with pack views registered", () => {
  it("renders a Summary card with the change request's facts, and a chip beside the link", () => {
    activateAppViewPacks([ciInsightsPackWebModule]);

    render(<ChangeRequestSummarySlot reference={reference} detail={detail} />);
    expect(container.querySelector("[data-fixture=flaky-tests]")?.textContent).toBe(
      "Flaky testsacme/app#7 · 2 retries on abc123 · yours",
    );

    render(<DigestPrChips prs={[pr]} />);
    const badge = container.querySelector("[data-fixture=flaky-badge]")!;
    expect(badge.getAttribute("data-density")).toBe("chip");
    // Beside the chip's link, never inside it: a link may not hold a link or a button.
    expect(badge.closest("a")).toBeNull();
    expect(badge.previousElementSibling?.tagName).toBe("A");
  });

  it("keeps the panel and its neighbours when a view throws, in registration order", () => {
    activateAppViewPacks([brokenPackWebModule]);

    render(<ChangeRequestSummarySlot reference={reference} detail={detail} />);
    expect(container.querySelector("[data-fixture=flaky-tests]")).not.toBeNull();
    expect(container.textContent).toContain("broken.summary could not be shown.");
    expect(
      [...container.firstElementChild!.children].map((node) => node.textContent?.slice(0, 11)),
    ).toEqual(["Flaky tests", "broken.summ"]);

    // A chip beside a PR is too small for a notice: the crashed one just goes away.
    render(<DigestPrChips prs={[pr]} />);
    expect(container.querySelector("[data-fixture=flaky-badge]")).not.toBeNull();
    expect(container.textContent).not.toContain("could not be shown");
  });

  it("binds each pack's scope around its view", () => {
    const seen: string[] = [];
    const Probe = () => {
      seen.push(usePackScope());
      return null;
    };
    activateAppViewPacks([
      {
        packId: "scoped",
        activate: defineWebActivate((context) =>
          context.registerView({
            slot: "changeRequest.summary",
            id: "scoped.probe",
            component: Probe,
          }),
        ),
      },
    ]);
    render(<ChangeRequestSummarySlot reference={reference} detail={detail} />);
    expect(new Set(seen)).toEqual(new Set(["scoped"]));
  });
});

const graph = {} as DigestGraph;
const section = (widget: string): DigestSection => ({
  id: "s1",
  kind: "items",
  widget,
  placement: "side",
  heading: "Burn",
  items: [],
});

describe("dashboard.widget and sidecar.section", () => {
  it("places a pack's widget by its definition, and only where the definition allows", () => {
    const lane = { graph, ticketsById: new Map(), nowMs: 0 };
    render(
      <DashboardWidget section={section("ci-insights.burndown")} placement="side" {...lane} />,
    );
    expect(container.querySelector("[data-fixture=burndown]")?.textContent).toBe("Burn (side)");

    render(
      <DashboardWidget section={section("ci-insights.burndown")} placement="main" {...lane} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers a pack's section to the sidecar next to the bundled ones", () => {
    const ids = listT3TeamSidecarSections().map((definition) => definition.id);
    expect(ids[0]).toBe("quick-starts");
    expect(ids).toContain("ci-insights.notes");

    const Notes = getT3TeamSidecarSectionComponent("ci-insights.notes")!;
    const host = {
      surface: "project.dashboard.myWork",
      projectId: "project-1",
      launchRecipe: () => {},
      openThread: () => {},
    };
    render(<Notes host={host as never} props={{ n: 1 }} />);
    expect(container.querySelector("[data-fixture=notes]")?.textContent).toBe('project-1 {"n":1}');
  });
});

describe("change request summary reset keys", () => {
  const cr = {
    host: "github",
    repository: "o/r",
    number: 1,
    state: "open" as const,
    headSha: "h",
    baseSha: "b",
    viewerAuthored: false,
  };

  it("changes with every fact a summary view reads", () => {
    const base = changeRequestSummaryResetKeys(cr);
    expect(changeRequestSummaryResetKeys({ ...cr })).toEqual(base);
    expect(changeRequestSummaryResetKeys({ ...cr, baseSha: "b2" })).not.toEqual(base);
    expect(changeRequestSummaryResetKeys({ ...cr, viewerAuthored: true })).not.toEqual(base);
    expect(changeRequestSummaryResetKeys({ ...cr, headSha: "h2" })).not.toEqual(base);
  });
});
