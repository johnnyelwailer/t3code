import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";

import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { MyWorkFirstLoadSwap } from "~/t3team/t3team-MyWorkFirstLoadSwap";
import { resetFirstLoadSessionForTests } from "~/t3team/t3team-myWorkFirstLoadReveal";
import { MyWorkScopeColumn } from "~/t3team/t3team-MyWorkScopeColumn";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { ProjectMyWorkViewSwitch } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { DIGEST_FIXTURE_NOW_MS } from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { allProjectsAgentScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenariosAllProjects";
import { StartupMyWorkFrame } from "~/t3team/t3team-StartupMyWorkGate";

const graph = allProjectsAgentScenario.graph;
const plan = resolveDigestPlan(
  buildHeuristicDigestPlan(graph, DIGEST_FIXTURE_NOW_MS),
  graph,
  DIGEST_FIXTURE_NOW_MS,
);
const noop = () => {};
const pick = { kind: "pick-project", projects: [], onPick: noop } as const;

/**
 * The cold start as the app plays it: the startup gate shows the greeting while it decides, then
 * hands over to My Work, whose digest answers `loadMs` after launch. Both stages are the real
 * components; only the clock is simulated. Reload the story to replay.
 */
function FirstLoadHandoff({ gateMs, loadMs }: { gateMs: number; loadMs: number }) {
  // A replay is a new cold start. Reset before the children mount (an effect would run after
  // theirs and orphan the session they already joined).
  useState(resetFirstLoadSessionForTests);
  const [stage, setStage] = useState<"gate" | "my-work">("gate");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const toMyWork = setTimeout(() => setStage("my-work"), gateMs);
    const answer = setTimeout(() => setLoaded(true), loadMs);
    return () => {
      clearTimeout(toMyWork);
      clearTimeout(answer);
    };
  }, [gateMs, loadMs]);
  if (stage === "gate") {
    return (
      <div className="flex h-screen bg-background text-foreground">
        <MyWorkFirstLoadSwap
          loading
          className="flex h-full min-h-0 w-full flex-col"
          renderPlaceholder={(greeting) => (
            <StartupMyWorkFrame lens="digest">{greeting}</StartupMyWorkFrame>
          )}
        >
          {null}
        </MyWorkFirstLoadSwap>
      </div>
    );
  }
  return (
    <div className="flex h-screen bg-background text-foreground">
      <MyWorkScopeColumn>
        <div>
          <ProjectMyWorkViewSwitch
            lens="digest"
            onLensChange={noop}
            backlog={pick}
            planning={pick}
          />
        </div>
        <MyWorkFirstLoadSwap loading={!loaded}>
          {loaded ? (
            <ProjectMyWorkDigestView plan={plan} graph={graph} nowMs={DIGEST_FIXTURE_NOW_MS} />
          ) : null}
        </MyWorkFirstLoadSwap>
      </MyWorkScopeColumn>
    </div>
  );
}

const meta = {
  title: "T3Team/Project Dashboard/My Work First Load Hand-off",
  component: FirstLoadHandoff,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
  argTypes: {
    gateMs: { label: "Startup gate decides after (ms)", control: "number" },
    loadMs: { label: "Digest answers after (ms)", control: "number" },
  },
} satisfies Meta<typeof FirstLoadHandoff>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Phil's case: the gate decides in ~half a second and My Work paints from the gate's cache. */
export const FastCachedLoad: Story = { args: { gateMs: 450, loadMs: 500 } };
/** A quick answer: the greeting never shows. */
export const VeryFast: Story = { args: { gateMs: 120, loadMs: 180 } };
/** A slow Jira: the greeting carries across the hand-off and cross-fades into the digest. */
export const SlowLoad: Story = { args: { gateMs: 900, loadMs: 2600 } };
