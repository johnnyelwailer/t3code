import type { BackendApi } from "~/t3team/backend/t3team-types";

const POLL_MS = 2_000;

/**
 * Resolves once the linked repository `url` has a usable checkout, polling the cheap status
 * endpoint (each poll is a file read on the server, so no single request nears a timeout).
 * Rejects when its background sync fails. Used before switching the main repository to a
 * repository whose first clone is still running.
 */
export async function waitForLinkedRepositoryReady(input: {
  readonly backend: BackendApi;
  readonly workspaceRoot: string;
  readonly url: string;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (;;) {
    const { linkedRepositories } = await input.backend.projectWorkspace.readLinkedRepositoryStatus({
      workspaceRoot: input.workspaceRoot,
    });
    const entry = linkedRepositories.find((candidate) => candidate.url === input.url);
    // Not a reference clone (e.g. the workspace's own repository): nothing to wait for.
    if (!entry) return;
    if (entry.syncState === undefined) {
      if (entry.status === "cloned" || entry.status === "updated") return;
      if (entry.status === "failed") {
        throw new Error(entry.error ?? `Linked repository '${input.url}' could not be cloned.`);
      }
    }
    await sleep(POLL_MS);
  }
}
