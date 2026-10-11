/**
 * PR watch, the universal indicator (hive design packet doc 07 §3, §4). The eye is the REAL
 * `WatchedPullRequestIndicator`, mounted inside the REAL surfaces: the digest PR pill
 * (`DigestPrChip`), the My Work card pill (`ProjectMyWorkPrChips`), the work item's GitHub
 * activity row (`GitHubActivitySection`), the digest review row, and the sidebar PR badge's hover
 * (`ThreadPullRequestBadgeControl`, upstream's port). The hover card is the real
 * `WatchedPullRequestCard`. The selector seam is fed by `T3TeamWatchedPullRequestsFixture`.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { WatchedPullRequestCard } from "~/components/pullRequest/t3team-WatchedPullRequestCard";
import { WatchedPullRequestIndicator } from "~/components/pullRequest/t3team-WatchedPullRequestIndicator";
import { WatchedPullRequestEye } from "~/components/pullRequest/t3team-watchedPullRequestEye";
import { ThreadPullRequestBadgeControl } from "~/components/ThreadStatusIndicators";
import { Button } from "~/components/ui/button";
import { T3TeamWatchedPullRequestsFixture } from "~/state/t3team-watchedPullRequests";
import type { WatchedPullRequestTone } from "~/state/t3team-watchedPullRequests.logic";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { GitHubActivitySection } from "~/t3team/t3team-GitHubActivitySection";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { DigestPrChip } from "~/t3team/t3team-ProjectMyWorkDigestPrChips";
import { ProjectMyWorkPrChips } from "~/t3team/t3team-ProjectMyWorkPrChips";
import type { DigestChangeRequest } from "~/t3team/t3team-projectMyWorkDigestTypes";
import {
  FIXTURE_ENVIRONMENT_ID,
  FIXTURE_HOST,
  LINK_377,
  LINK_398,
  LINK_401,
  LINK_412,
  WATCHED_FIXTURE,
  WATCHER_377_THREAD,
  WATCHER_377_UNSURE,
  WATCHER_398_PARKED,
  WATCHER_412_FIXING,
} from "~/t3team/t3team-prWatchFixtures";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-2xs font-semibold text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

const TONES: ReadonlyArray<{ tone: WatchedPullRequestTone; label: string }> = [
  { tone: "quiet", label: "Watching, quiet" },
  { tone: "working", label: "Fixing (thread working)" },
  { tone: "needs-you", label: "Needs you (question docked)" },
  { tone: "attention", label: "Approval pending / parked" },
];

function digestPr(
  link: typeof LINK_412,
  state: "open" | "needs-you" | "merged",
): DigestChangeRequest {
  return {
    id: `pr-${link.number}`,
    ticketId: "NX-812",
    title: link.snapshot?.title ?? link.repository,
    projectId: "project-nexi",
    host: link.host,
    repo: link.repository,
    number: link.number,
    state,
    reviewers: [],
    additions: 214,
    deletions: 38,
    updatedAt: "2026-10-08T09:00:00.000Z",
  };
}

function activityItem(link: typeof LINK_412): GitHubWorkActivityItem {
  return {
    id: `${link.host}:${link.repository}#${link.number}`,
    repository: link.repository,
    reason: "author",
    subjectType: "PullRequest",
    subjectTitle: link.snapshot?.title ?? link.repository,
    subjectUrl: link.url,
    subjectState: link.snapshot?.state === "merged" ? "merged" : "open",
    updatedAt: "2026-10-08T09:00:00.000Z",
  };
}

function Surfaces() {
  return (
    <T3TeamWatchedPullRequestsFixture.Provider value={WATCHED_FIXTURE}>
      <div className="grid gap-8 bg-background p-6 text-foreground md:grid-cols-2">
        <Block title="States (WatchedPullRequestEye)">
          <div className="flex flex-wrap gap-6">
            {TONES.map(({ tone, label }) => (
              <div key={tone} className="flex flex-col items-center gap-1">
                <WatchedPullRequestEye tone={tone} size="md" />
                <span className="text-2xs text-muted-foreground">{label}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground/40">—</span>
              <span className="text-2xs text-muted-foreground">Not watched: nothing</span>
            </div>
          </div>
        </Block>

        <Block title="Hover card · babysitter, individual thread, parked (WatchedPullRequestCard)">
          <div className="flex flex-wrap gap-4">
            <div className="w-80 rounded-lg border bg-popover p-2 shadow-lg">
              <WatchedPullRequestCard
                identity={LINK_412}
                watchers={[WATCHER_412_FIXING]}
                link={LINK_412}
              />
            </div>
            <div className="w-80 rounded-lg border bg-popover p-2 shadow-lg">
              <WatchedPullRequestCard
                identity={LINK_377}
                watchers={[WATCHER_377_UNSURE, WATCHER_377_THREAD]}
                link={LINK_377}
              />
            </div>
            <div className="w-80 rounded-lg border bg-popover p-2 shadow-lg">
              <WatchedPullRequestCard
                identity={LINK_398}
                watchers={[WATCHER_398_PARKED]}
                link={LINK_398}
              />
            </div>
          </div>
        </Block>

        <Block title="My Work digest row · DigestPrChip (hover the eye; click pins)">
          <div className="@container/prs flex w-[34rem] flex-wrap gap-1.5 rounded-lg border bg-card p-3">
            <DigestPrChip
              pr={digestPr(LINK_412, "open")}
              repoLabel={(repo) => repo.split("/")[1] ?? repo}
            />
            <DigestPrChip
              pr={digestPr(LINK_377, "needs-you")}
              repoLabel={(repo) => repo.split("/")[1] ?? repo}
            />
            <DigestPrChip
              pr={digestPr(LINK_401, "merged")}
              repoLabel={(repo) => repo.split("/")[1] ?? repo}
            />
          </div>
        </Block>

        <Block title="Kanban / hierarchy card · ProjectMyWorkPrChips">
          <div className="w-72 rounded-lg border bg-card p-2.5">
            <div className="px-1 text-sm">Lane store for the kanban matrix</div>
            <div className="px-1 text-2xs text-muted-foreground">NX-830 · Phil J</div>
            <ProjectMyWorkPrChips items={[activityItem(LINK_398), activityItem(LINK_412)]} />
          </div>
        </Block>

        <Block title="Work item · Related GitHub activity (GitHubActivitySection)">
          <div className="w-[30rem]">
            <GitHubActivitySection
              title="Related GitHub activity"
              items={[activityItem(LINK_412), activityItem(LINK_377), activityItem(LINK_401)]}
            />
          </div>
        </Block>

        <Block title="Sidebar PR badge hover · ThreadPullRequestBadgeControl (upstream port, eye = stop)">
          <div className="flex items-center gap-2 rounded-lg border bg-sidebar p-3 text-xs">
            <span className="text-muted-foreground">Babysit #412 · Scope filter for tickets</span>
            <ThreadPullRequestBadgeControl
              render={<Button variant="ghost" size="xs" />}
              threadRef={{
                environmentId: FIXTURE_ENVIRONMENT_ID,
                threadId: WATCHER_412_FIXING.threadRef.threadId,
              }}
              badge={{ kind: "pull-request", others: 0, state: "open" }}
              pullRequests={[LINK_412]}
              number={412}
              url={LINK_412.url}
              status={null}
              onOpenList={() => {}}
              onOpenPullRequest={() => {}}
            />
            <WatchedPullRequestIndicator
              environmentId={FIXTURE_ENVIRONMENT_ID}
              host={FIXTURE_HOST}
              repository={LINK_412.repository}
              number={412}
            />
          </div>
        </Block>
      </div>
    </T3TeamWatchedPullRequestsFixture.Provider>
  );
}

const meta = {
  title: "T3Team/PR Watch/Watched Indicator",
  component: Surfaces,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Surfaces>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnEverySurface: Story = {};
