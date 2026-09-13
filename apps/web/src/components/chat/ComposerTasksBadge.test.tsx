import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ComposerTasksBadge,
  ComposerTasksContent,
  type ComposerTaskStep,
  type ComposerTasksProgress,
} from "./ComposerTasksBadge";

const NOW = new Date("2026-09-13T12:00:00.000Z").getTime();
vi.setSystemTime(NOW);

const progress: ComposerTasksProgress = {
  step: "Run the failing test",
  completedSteps: 1,
  totalSteps: 2,
};
const steps: readonly ComposerTaskStep[] = [
  { step: "Find the assertion", status: "completed" },
  { step: "Run the failing test", status: "inProgress" },
];

describe("ComposerTasksBadge plan staleness label", () => {
  it("keeps the collapsed badge free of the last-updated time", () => {
    const markup = renderToStaticMarkup(
      <ComposerTasksBadge
        expanded={false}
        onToggle={() => {}}
        progress={progress}
        steps={steps}
      />,
    );

    expect(markup).not.toContain("data-composer-task-updated");
    expect(markup).toContain("1/2 complete");
  });

  it("shows the relative last-updated time in the expanded panel header", () => {
    const markup = renderToStaticMarkup(
      <ComposerTasksContent
        expanded
        onToggle={() => {}}
        progress={progress}
        steps={steps}
        planUpdatedAt={new Date(NOW - 40 * 60_000).toISOString()}
      />,
    );

    expect(markup).toContain("data-composer-task-updated");
    expect(markup).toContain(">Updated 40m ago<");
  });

  it("omits the header label when the plan has no last-updated instant", () => {
    const markup = renderToStaticMarkup(
      <ComposerTasksContent expanded onToggle={() => {}} progress={progress} steps={steps} />,
    );

    expect(markup).not.toContain("data-composer-task-updated");
  });
});
