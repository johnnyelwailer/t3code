import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import type { BackgroundJobState } from "@t3tools/client-runtime/work-log/background-jobs";

import {
  BackgroundJobsRunningIndicator,
  BackgroundJobList,
  BackgroundJobRunningBadge,
} from "~/components/chat/BackgroundJobsIndicator";
import { BackgroundJobOutputPanel } from "~/components/chat/BackgroundJobOutputPanel";
import {
  createThreadJobsController,
  type ThreadJobsController,
  type ThreadJobsControlResponse,
} from "~/t3team/backend/t3team-thread-jobsBackend";

const NOW = Date.now();

function jobs(
  list: Array<
    Pick<BackgroundJobState, "jobId"> & {
      readonly command?: string;
      readonly label?: string;
      readonly ageMs?: number;
      readonly pid?: number;
    }
  >,
): BackgroundJobState[] {
  return list.map((job, i) => ({
    jobId: job.jobId,
    ...(job.command !== undefined ? { command: job.command } : {}),
    ...(job.label !== undefined ? { label: job.label } : {}),
    ...(job.pid !== undefined ? { pid: job.pid } : {}),
    startedAtMs: NOW - (job.ageMs ?? 45_000 + i * 20_000),
    // 10-minute hard deadline, as the runtime reports it.
    deadlineMs: NOW + (job.ageMs !== undefined ? 540_000 - job.ageMs : 500_000),
    state: "running",
  }));
}

const SAMPLE = jobs([
  {
    jobId: "job_8865dcbe",
    command: "pnpm -r build && pnpm -r test",
    label: "Building the production bundle",
    pid: 48211,
    ageMs: 190_000,
  },
  {
    jobId: "job_a1b2c3d4",
    command: "git log -p --stat main..HEAD | less",
    label: "Reviewing the diff",
    pid: 48260,
    ageMs: 40_000,
  },
]);

/** SAMPLE is built from a non-empty literal array; the assertion is the one
 *  place we trust that, instead of threading a guard through every story. */
const SAMPLE_HEAD = SAMPLE[0]!;

/**
 * A mock job-registry controller: each read-output poll appends a few lines
 * (a busy long-running job), cancel stops the stream and settles the job.
 * Good enough to show the live tail and the cancel flow in isolation.
 */
function makeMockController() {
  const buffer =
    "vite v7.2.0 building for production...\n" +
    Array.from({ length: 40 }, (_, i) => `  dist/chunk-${i}.js   ${(i * 1.7).toFixed(1)} kB`).join(
      "\n",
    ) +
    "\n✓ built in 8.4s";
  let cursor = 0;
  let settled = false;
  let cancelled = false;

  const controller: ThreadJobsController = async ({
    request,
  }): Promise<ThreadJobsControlResponse> => {
    if (request.kind === "list") {
      return {
        supported: true,
        result: {
          kind: "jobs",
          jobs: SAMPLE.map((job) => ({
            jobId: job.jobId,
            command: job.command ?? job.jobId,
            state: "running",
            exitCode: null,
            startedAtMs: job.startedAtMs,
          })),
        },
      };
    }
    if (request.kind === "cancel") {
      settled = true;
      cancelled = true;
      return {
        supported: true,
        result: {
          kind: "cancelled",
          jobId: request.jobId,
          state: "cancelled",
          exitCode: null,
          elapsedMs: 210_000,
          command: SAMPLE[0]?.command ?? request.jobId,
        },
      };
    }
    // read-output: emit a page up to (and a little past) the stored buffer.
    const text = buffer.slice(request.since ?? 0, (request.since ?? 0) + buffer.length);
    cursor = Math.max(cursor, (request.since ?? 0) + text.length);
    return {
      supported: true,
      result: {
        kind: "output",
        jobId: request.jobId,
        text,
        nextCursor: cursor,
        oldestRetained: 0,
        settled,
      },
    };
  };

  return controller;
}

const meta = {
  title: "T3Team/Chat/Background Jobs Indicator",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Collapsed by default: one quiet line in the working-row slot. */
export const Collapsed: Story = {
  render: () => (
    <div className="max-w-xl">
      <BackgroundJobsRunningIndicator jobs={SAMPLE} />
    </div>
  ),
};

/** Read-only when the surface cannot reach the runtime's job registry. */
export const ReadOnlyList: Story = {
  render: () => (
    <div className="max-w-xl">
      <BackgroundJobsRunningIndicator jobs={SAMPLE} />
      <p className="mt-2 text-xs text-muted-foreground">
        No controller → no Cancel / Output. The list still shows what is running.
      </p>
    </div>
  ),
};

/** The live control channel: expand, tail the output, cancel the job. */
export const WithControl: Story = {
  render: () => {
    const [controller] = useState<ThreadJobsController>(() => makeMockController());
    return (
      <div className="max-w-xl">
        <BackgroundJobsRunningIndicator
          jobs={SAMPLE}
          threadId="thread-story"
          controller={controller}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Expand the line, then hit <span className="font-mono">output</span> to tail the job's
          retained stream, or <span className="font-mono">cancel</span> to stop it.
        </p>
      </div>
    );
  },
};

/** The real fetch-backed controller shape, for reference (no live backend here). */
export const RealController: Story = {
  render: () => (
    <div className="max-w-xl space-y-2">
      <p className="text-xs text-muted-foreground">
        In the app this is built from the backend URL:
      </p>
      <pre className="overflow-x-auto rounded-md bg-black/85 p-2 font-mono text-[.7rem] text-white/85">
        {`createThreadJobsController(resolveHttpBaseUrl(resolveWsBaseUrl()))
// POST /api/t3team/thread/jobs
// { supported: false }  → hide the affordances
// { supported: true, result } → list / cancel / read-output`}
      </pre>
      <BackgroundJobsRunningIndicator
        jobs={SAMPLE}
        threadId="thread-story"
        controller={createThreadJobsController("http://localhost:3773/")}
      />
    </div>
  ),
};

/** The expanded state without clicking: per-job rows stack UNDER the
 *  summary line, full width; the output tail opens under the rows and
 *  repeats nothing the row already says. */
export const ExpandedWithOutput: Story = {
  render: () => {
    const [controller] = useState<ThreadJobsController>(() => makeMockController());
    return (
      <div className="max-w-xl py-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-info" aria-hidden />
          <span className="min-w-0 truncate">2 background jobs running · 3m 10s</span>
        </div>
        <div className="mt-1">
          <BackgroundJobList
            running={SAMPLE}
            now={Date.now()}
            canControl
            cancelPending={new Set()}
            onCancel={() => {}}
            onShowOutput={() => {}}
          />
          <BackgroundJobOutputPanel
            threadId="thread-story"
            jobId={SAMPLE_HEAD.jobId}
            controller={controller}
            onClose={() => {}}
          />
        </div>
      </div>
    );
  },
};

/** The tool-card anchor tag on the bash row that yielded the handle. */
export const RunningBadge: Story = {
  render: () => (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 rounded-md border border-border/60 p-2">
        <span className="font-mono text-xs text-foreground/80">bash · pnpm -r build</span>
        <span className="ml-auto">
          <BackgroundJobRunningBadge job={SAMPLE_HEAD} />
        </span>
      </div>
    </div>
  ),
};
