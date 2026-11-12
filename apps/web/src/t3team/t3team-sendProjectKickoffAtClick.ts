import { readProjects } from "~/state/entities";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AppHandlersInput } from "~/t3team/t3team-appHandlersTypes";
import { sendKickoffAtClick } from "~/t3team/t3team-sendKickoffAtClick";
import type { ProjectThread } from "~/t3team/t3team-types";

/** {@link sendKickoffAtClick} for a thread the project store just created, with the live projects read now. */
export function sendProjectKickoffAtClick(input: {
  backend: BackendApi | null | undefined;
  environmentId: string | null | undefined;
  store: Pick<AppHandlersInput["store"], "allProjects" | "markThreadKickoffConsumed">;
  thread: ProjectThread;
}): boolean {
  const { store, thread } = input;
  return sendKickoffAtClick({
    backend: input.backend,
    environmentId: input.environmentId,
    project: store.allProjects.find((candidate) => candidate.id === thread.projectId),
    thread,
    liveProjects: readProjects(),
    markKickoffConsumed: store.markThreadKickoffConsumed,
  });
}
