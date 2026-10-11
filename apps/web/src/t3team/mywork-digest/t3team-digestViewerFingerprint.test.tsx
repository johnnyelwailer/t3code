/** @vitest-environment jsdom */
/**
 * The viewer name arrives LATE on a cold start.
 *
 * The digest asks the server with the Jira display name from the Atlassian accounts cache, and
 * that cache is often still empty when the first poll goes out. The fingerprint the server hands
 * back belongs to the answer for the name that round asked with — so once the name changes, that
 * fingerprint is an answer to a different question, and sending it risks a `unchanged` round that
 * keeps a graph built for the wrong (or no) viewer. The hook drops it instead.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { MyWorkDigestPollFn } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import { writeIntegrationCache } from "~/t3team/hooks/t3team-integrationCache";
import { clearCachedDigestGraphsForTests } from "./t3team-digestGraphCache";
import { useMyWorkDigestGraph } from "./t3team-useMyWorkDigestGraph";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const project: ProjectShellProject = {
  id: "p1" as never,
  title: "Project p1",
  source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES", raw: {} },
  workspace: { rootPath: "/tmp/p1", createdAt: "2026-05-21T18:30:35.000Z" },
  createdAt: "2026-05-21T18:30:35.000Z",
  updatedAt: "2026-05-21T18:30:35.000Z",
} as ProjectShellProject;

const payload = {
  scope: "project" as const,
  projects: [
    {
      project: { id: "IES", name: "IES NG" },
      tickets: [],
      claims: [],
      decisions: [],
      changeRequests: [],
      transitions: [],
    },
  ],
};

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

beforeEach(() => {
  localStorage.clear();
  clearCachedDigestGraphsForTests();
});

describe("digest viewer fingerprint", () => {
  it("drops the fingerprint for the round after the viewer's display name resolves", async () => {
    const rounds: Array<{ viewer: string | undefined; knownFingerprint: string | undefined }> = [];
    const pollFn: MyWorkDigestPollFn = async (input) => {
      rounds.push({
        viewer: input.viewer?.name,
        knownFingerprint: input.knownFingerprint,
      });
      return { unchanged: false, fingerprint: "sha256:one", value: payload };
    };
    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      orchestration: createRecordingOrchestrationApi(),
      listThreadPlacements: async () => [],
      atlassian: {
        pollMyWorkDigest: (input: Parameters<MyWorkDigestPollFn>[0]) => pollFn(input),
      } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;

    const latest: { result: ReturnType<typeof useMyWorkDigestGraph> | null } = { result: null };
    function Harness() {
      // No explicit viewer: the hook falls back to the Atlassian accounts cache, exactly like
      // the digest views do.
      latest.result = useMyWorkDigestGraph({ projects: [project] });
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <Harness />
        </BackendProvider>,
      );
    });
    await vi.waitFor(() => expect(rounds).toHaveLength(1));
    // Round one went out before the accounts cache had a name.
    expect(rounds[0]?.viewer).toBe("");

    // A later reload with the SAME (missing) name carries the fingerprint: nothing changed.
    await act(async () => latest.result?.reload());
    await vi.waitFor(() => expect(rounds).toHaveLength(2));
    expect(rounds[1]?.knownFingerprint).toBe("sha256:one");

    // The accounts integration answers; the chip and the digest now know the viewer.
    writeIntegrationCache("atlassian:listAccounts", [{ id: "acct-1", label: "Philip Jonientz" }]);
    await act(async () => latest.result?.reload());
    await vi.waitFor(() => expect(rounds).toHaveLength(3));
    expect(rounds[2]?.viewer).toBe("Philip Jonientz");
    // The question changed, so the answer we hold cannot short-circuit it.
    expect(rounds[2]?.knownFingerprint).toBeUndefined();

    // And the round after that is back to normal short-circuiting.
    await act(async () => latest.result?.reload());
    await vi.waitFor(() => expect(rounds).toHaveLength(4));
    expect(rounds[3]?.knownFingerprint).toBe("sha256:one");
  });
});
