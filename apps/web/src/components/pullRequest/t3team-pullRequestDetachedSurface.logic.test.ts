import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { detachedSurfacePath } from "@t3tools/shared/t3team-detachedSurface";
import { describe, expect, it } from "vite-plus/test";

import {
  pullRequestDetachedSurfaceFromParams,
  pullRequestDetachedSurfaceRequest,
} from "./t3team-pullRequestDetachedSurface.logic";

const surface = {
  environmentId: "env-1" as EnvironmentId,
  reference: {
    projectId: "project-1" as ProjectId,
    host: "github.com",
    repository: "Acme/App",
    number: 12,
  },
  view: { tab: "code" as const, file: "src/index.ts" },
};

function roundTrip(title: string | null) {
  const request = pullRequestDetachedSurfaceRequest({ ...surface, title });
  const url = new URL(detachedSurfacePath(request), "t3code://app");
  return {
    request,
    parsed: pullRequestDetachedSurfaceFromParams(Object.fromEntries(url.searchParams)),
  };
}

describe("pull request detached surface", () => {
  it("round-trips the pull request and the view through the URL", () => {
    expect(roundTrip("Fix the thing").parsed).toEqual(surface);
  });

  it("keys the window by pull request, not by tab", () => {
    const code = pullRequestDetachedSurfaceRequest({ ...surface, title: null });
    const summary = pullRequestDetachedSurfaceRequest({
      ...surface,
      view: { tab: "summary", file: null },
      title: null,
    });
    expect(code.key).toBe(summary.key);
  });

  it("titles the window with the number and title, or the repository before detail loads", () => {
    expect(roundTrip("Fix the thing").request.title).toBe("#12 Fix the thing");
    expect(roundTrip(null).request.title).toBe("#12 · Acme/App");
  });

  it("opens on the summary when the view is the default one", () => {
    const request = pullRequestDetachedSurfaceRequest({
      ...surface,
      view: { tab: "summary", file: null },
      title: null,
    });
    expect(pullRequestDetachedSurfaceFromParams(request.params)?.view).toEqual({
      tab: "summary",
      file: null,
    });
  });

  it("rejects params that do not name a pull request", () => {
    expect(pullRequestDetachedSurfaceFromParams({})).toBeNull();
    expect(
      pullRequestDetachedSurfaceFromParams({
        environmentId: "env-1",
        projectId: "project-1",
        repository: "acme/app",
        number: "0",
      }),
    ).toBeNull();
    expect(
      pullRequestDetachedSurfaceFromParams({
        environmentId: "env-1",
        projectId: "project-1",
        repository: "acme/app",
        number: "abc",
      }),
    ).toBeNull();
  });
});
