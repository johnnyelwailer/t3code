/**
 * Plays a scripted poll sequence through the real My Work digest: the real hook, the real
 * `ProjectMyWorkDigestContent`, with only the server's answers faked at the backend seam. The
 * caption above names the round that last landed, so a reader can match what moved to what changed.
 */
import { useState, useSyncExternalStore } from "react";

import { ProjectShellProjectId, type ProjectShellProject } from "@t3tools/project-context";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type {
  MyWorkDigestPollFn,
  MyWorkDigestPollInput,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  digestScopeSignature,
  writeCachedDigestGraph,
} from "~/t3team/mywork-digest/t3team-digestGraphCache";
import { payloadToDigestGraph } from "~/t3team/mywork-digest/t3team-digestGraphMappers";
import { toDigestProjectEntries } from "~/t3team/mywork-digest/t3team-digestProjectEntries";
import { ProjectMyWorkDigestContent } from "~/t3team/t3team-ProjectMyWorkDigestContent";

import { replayPayload, type DigestReplayStep } from "./t3team-digestPollReplayScenario";

type Caption = { readonly round: number; readonly label: string };

function createReplay(steps: ReadonlyArray<DigestReplayStep>) {
  let round = 0;
  let caption: Caption = { round: 0, label: "waiting for the first round" };
  const listeners = new Set<() => void>();
  const announce = (next: Caption) => {
    caption = next;
    listeners.forEach((listener) => listener());
  };
  const poll: MyWorkDigestPollFn = async (input: MyWorkDigestPollInput) => {
    const current = steps[Math.min(round, steps.length - 1)];
    if (current === undefined) throw new Error("The replay has no steps.");
    round += 1;
    await new Promise((resolve) => setTimeout(resolve, current.latencyMs));
    const fingerprint = JSON.stringify({ ...current.world, dropped: [...current.world.dropped] });
    announce({ round, label: current.label });
    return input.knownFingerprint === fingerprint
      ? { unchanged: true, fingerprint }
      : { unchanged: false, fingerprint, value: replayPayload(current.world) };
  };
  const mock = createMockBackend();
  const backend: BackendApi = {
    ...mock,
    atlassian: Object.assign(mock.atlassian, { pollMyWorkDigest: poll }),
  };
  return {
    backend,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => caption,
  };
}

function replayProject(nonce: number): ProjectShellProject {
  return {
    id: ProjectShellProjectId.make(`replay-project-${String(nonce)}`),
    title: "IES NG",
    source: { provider: "atlassian", accountId: "acct-replay", externalProjectId: "IES", raw: {} },
    workspace: { rootPath: "/tmp/replay", createdAt: "2026-09-01T00:00:00.000Z" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function seedCachedPaint(project: ProjectShellProject, step: DigestReplayStep | undefined) {
  if (step === undefined) return;
  const entries = toDigestProjectEntries([project]);
  const payload = replayPayload(step.world);
  const graph = payloadToDigestGraph({
    payload,
    projects: [project],
    entries,
    viewer: { name: "Philip", role: "", lastVisitAt: "1970-01-01T00:00:00.000Z" },
  });
  writeCachedDigestGraph(digestScopeSignature("project", entries), graph, false);
}

function ReplayCaption({ replay }: { replay: ReturnType<typeof createReplay> }) {
  const caption = useSyncExternalStore(replay.subscribe, replay.snapshot);
  return (
    <p
      data-testid="digest-replay-caption"
      data-round={caption.round}
      className="h-5 text-xs text-muted-foreground"
    >
      Round {caption.round}: {caption.label}
    </p>
  );
}

function ReplayRun({
  steps,
  cachedPaint,
  nonce,
}: {
  steps: ReadonlyArray<DigestReplayStep>;
  cachedPaint: boolean;
  nonce: number;
}) {
  const [run] = useState(() => {
    const project = replayProject(nonce);
    if (cachedPaint) seedCachedPaint(project, steps[0]);
    return { project, replay: createReplay(steps) };
  });
  return (
    <>
      <ReplayCaption replay={run.replay} />
      <div data-testid="digest-replay-root">
        <BackendProvider backend={run.replay.backend}>
          <ProjectMyWorkDigestContent project={run.project} onOpenTicket={() => undefined} />
        </BackendProvider>
      </div>
    </>
  );
}

export function DigestPollReplay({
  steps,
  cachedPaint = false,
}: {
  steps: ReadonlyArray<DigestReplayStep>;
  cachedPaint?: boolean;
}) {
  const [nonce, setNonce] = useState(0);
  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <div className="mx-auto w-full space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            Replay
          </button>
          <p className="max-w-2xl text-xs text-muted-foreground">
            A round lands about every 3 seconds, the way the server's pull request catch-up polls.
            The digest below is the real one.
          </p>
        </div>
        <ReplayRun key={nonce} steps={steps} cachedPaint={cachedPaint} nonce={nonce} />
      </div>
    </div>
  );
}
