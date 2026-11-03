import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { render } from "../../../test/render";
import {
  useOpenLinkedPullRequest,
  type LinkedPullRequestSelection,
} from "./t3team-useOpenLinkedPullRequest";

const PANEL_REF = scopeThreadRef(EnvironmentId.make("panel-env"), ThreadId.make("panel-thread"));

/** A new object on every call, as the page's scope hook hands over on every render. */
function linkTo(number: number): LinkedPullRequestSelection {
  return {
    environmentId: EnvironmentId.make("env-1"),
    repository: "johnnyelwailer/t3code",
    number,
    projectId: ProjectId.make("project-1"),
    host: "github.com",
  };
}

function Probe(props: {
  readonly linkedSelection: LinkedPullRequestSelection | null;
  readonly supported?: boolean;
}) {
  useOpenLinkedPullRequest({
    rightPanelRef: PANEL_REF,
    supported: props.supported ?? true,
    linkedSelection: props.linkedSelection,
  });
  return null;
}

function userActions() {
  return useRightPanelStore.getState().getUserActionRevision(PANEL_REF);
}

function activeSurface() {
  return selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, PANEL_REF);
}

function resetPanelStore() {
  useRightPanelStore.setState({
    byThreadKey: {},
    threadPanelVisibilityByThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
  });
}

/** An empty panel store for one test, emptied again when the test ends. */
function emptyPanelStore(): Disposable {
  resetPanelStore();
  return { [Symbol.dispose]: resetPanelStore };
}

describe("useOpenLinkedPullRequest", () => {
  it("opens the linked pull request once while its fields stay the same", async () => {
    using _store = emptyPanelStore();
    await using screen = await render(<Probe linkedSelection={linkTo(765)} />);
    await screen.rerender(<Probe linkedSelection={linkTo(765)} />);
    await screen.rerender(<Probe linkedSelection={linkTo(765)} />);
    await screen.rerender(<Probe linkedSelection={linkTo(765)} />);

    expect(userActions()).toBe(1);
    expect(activeSurface()).toMatchObject({
      kind: "pull-request",
      repository: "johnnyelwailer/t3code",
      number: 765,
      host: "github.com",
    });
  });

  it("opens the next pull request when the link changes", async () => {
    using _store = emptyPanelStore();
    await using screen = await render(<Probe linkedSelection={linkTo(765)} />);
    await screen.rerender(<Probe linkedSelection={linkTo(766)} />);

    expect(userActions()).toBe(2);
    expect(activeSurface()).toMatchObject({ number: 766 });
  });

  it("opens nothing without a link or without pull request support", async () => {
    using _store = emptyPanelStore();
    await using screen = await render(<Probe linkedSelection={null} />);
    await screen.rerender(<Probe linkedSelection={linkTo(765)} supported={false} />);

    expect(userActions()).toBe(0);
  });
});
