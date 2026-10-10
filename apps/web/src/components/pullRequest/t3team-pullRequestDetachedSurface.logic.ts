/**
 * The pull-request detail panel as a detached surface: what a request to open it carries, and
 * how the detached page reads that back. The request names one pull request and the view the
 * reader was on (tab, and the focused file on the Code tab), so the window opens where they
 * were looking — undocking the Code tab lands on the Code tab.
 */
import type { EnvironmentId, ProjectId, PullRequestRef } from "@t3tools/contracts";
import type { DetachedSurfaceRequest } from "@t3tools/shared/t3team-detachedSurface";

import {
  pullRequestDetailViewStateSearchFields,
  pullRequestDetailViewStateSearchPatch,
  type PullRequestDetailViewState,
} from "./t3team-prDetailViewState.logic";

export const PULL_REQUEST_DETACHED_SURFACE_KIND = "pull-request";

const MAX_FIELD_LENGTH = 200;

export interface PullRequestDetachedSurface {
  readonly environmentId: EnvironmentId;
  readonly reference: Pick<PullRequestRef, "projectId" | "host" | "repository" | "number">;
  readonly view: PullRequestDetailViewState;
}

export function pullRequestDetachedSurfaceRequest(
  surface: PullRequestDetachedSurface & { readonly title: string | null },
): DetachedSurfaceRequest {
  const { environmentId, reference, view } = surface;
  const host = reference.host ?? "";
  return {
    kind: PULL_REQUEST_DETACHED_SURFACE_KIND,
    // One window per pull request, whichever tab it was undocked from: undocking another tab of
    // the same pull request brings that window forward on the new tab.
    key: `${environmentId}:${reference.projectId}:${host}:${reference.repository.toLowerCase()}#${reference.number}`,
    params: {
      environmentId,
      projectId: reference.projectId,
      ...(host === "" ? {} : { host }),
      repository: reference.repository,
      number: String(reference.number),
      ...pullRequestDetailViewStateSearchPatch(view),
    },
    title:
      surface.title === null || surface.title.trim() === ""
        ? `#${reference.number} · ${reference.repository}`
        : `#${reference.number} ${surface.title.trim()}`,
  };
}

function field(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value.slice(0, MAX_FIELD_LENGTH);
}

/** The surface a detached page's params describe, or null when they do not name a pull request. */
export function pullRequestDetachedSurfaceFromParams(
  params: Readonly<Record<string, unknown>>,
): PullRequestDetachedSurface | null {
  const environmentId = field(params.environmentId);
  const projectId = field(params.projectId);
  const repository = field(params.repository);
  const number = Number(field(params.number));
  if (
    environmentId === undefined ||
    projectId === undefined ||
    repository === undefined ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }
  const host = field(params.host);
  const { tab, file } = pullRequestDetailViewStateSearchFields(params);
  return {
    environmentId: environmentId as EnvironmentId,
    reference: {
      projectId: projectId as ProjectId,
      repository,
      number,
      ...(host === undefined ? {} : { host }),
    },
    view: { tab: tab ?? "summary", file: file ?? null },
  };
}
