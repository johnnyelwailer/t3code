import {
  EnvironmentId,
  NodeId,
  ProviderSessionId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type AuthSessionState,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { useRef } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

// On a cloud session, Approve and Submit answer were dropped silently while the environment's
// session state was loading or failed to revalidate.
const sent = vi.hoisted(() => [] as Array<{ label: string; value: unknown }>);
const interrupt = vi.hoisted(() => ({ next: false }));
vi.mock(import("../../state/use-atom-command"), () => ({
  useAtomCommand: ((command: { label?: string }) => async (value: unknown) => {
    if (interrupt.next) {
      interrupt.next = false;
      return AsyncResult.failure(Cause.interrupt());
    }
    sent.push({ label: command.label ?? "", value });
    return AsyncResult.success(undefined);
  }) as never,
}));
const sessionAtoms = vi.hoisted(() => new Map<string, unknown>());
vi.mock(import("../../state/session"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    environmentSession: {
      ...original.environmentSession,
      sessionStateAtom: ((environmentId: string) => sessionAtoms.get(environmentId)) as never,
    },
  };
});

import { act, render } from "../../../test/render";
import { makeThreadProjectionFixture } from "../../test-fixtures";
import { toastManager } from "../ui/toast";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { usePendingThreadRequests } from "./usePendingThreadRequests";

const cloud = EnvironmentId.make("cloud-session-env");
const threadId = ThreadId.make("cloud-thread");
const approvalId = RuntimeRequestId.make("route-approval");
let questionId = RuntimeRequestId.make("setup-question");

function cloudProjection(): OrchestrationV2ThreadProjection {
  const base = makeThreadProjectionFixture();
  const request = (id: RuntimeRequestId, kind: "command" | "user_input") => ({
    id,
    nodeId: NodeId.make(id),
    providerTurnId: null,
    nativeRequestRef: null,
    kind,
    status: "pending" as const,
    responseCapability: {
      type: "live" as const,
      providerSessionId: ProviderSessionId.make("cloud-provider-session"),
    },
    createdAt: base.updatedAt,
    resolvedAt: null,
  });
  return {
    ...base,
    thread: { ...base.thread, id: threadId },
    runtimeRequests: [request(approvalId, "command"), request(questionId, "user_input")],
    turnItems: [
      {
        id: TurnItemId.make("setup-question-item"),
        threadId,
        runId: null,
        nodeId: NodeId.make(questionId),
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 0,
        status: "completed" as const,
        title: null,
        startedAt: base.updatedAt,
        completedAt: base.updatedAt,
        updatedAt: base.updatedAt,
        type: "user_input_request" as const,
        requestId: questionId,
        questions: [
          {
            id: "registry",
            header: "Registry",
            question: "Which package registry?",
            options: [{ label: "github.com nexplore", description: "From Frontend/.npmrc" }],
            multiSelect: false,
          },
        ],
      },
    ],
  } satisfies OrchestrationV2ThreadProjection;
}

function CloudThreadCards({ projection }: { projection: OrchestrationV2ThreadProjection }) {
  const promptRef = useRef("");
  const composerRef = useRef(null);
  const requests = usePendingThreadRequests({
    environmentId: cloud,
    activeThreadId: threadId,
    serverProjection: projection,
    supportsQuestionAttachments: false,
    composerDraftTarget: { environmentId: cloud, threadId },
    setComposerDraftPrompt: () => {},
    promptRef,
    composerRef,
    setThreadError: () => {},
  });
  return (
    <>
      <ComposerPendingApprovalActions
        requestId={approvalId}
        isResponding={false}
        canRespond
        onRespondToApproval={requests.onRespondToApproval}
      />
      <button
        type="button"
        onClick={() =>
          requests.onSelectActivePendingUserInputOption("registry", "github.com nexplore")
        }
      >
        github.com nexplore
      </button>
      <button type="button" onClick={() => requests.onAdvanceActivePendingUserInput()}>
        Submit answer
      </button>
    </>
  );
}

const KNOWN_READ_ONLY = {
  authenticated: true,
  permissions: ["orchestration:read"],
} as unknown as AuthSessionState;

/** Each test starts from no sent commands and the given cloud session state. */
function setSessionState(result: AsyncResult.AsyncResult<AuthSessionState, unknown>) {
  sent.length = 0;
  interrupt.next = false;
  sessionAtoms.set(cloud, Atom.make(result));
}

it.each([
  ["still loading", AsyncResult.initial<AuthSessionState>(true)],
  ["failed to revalidate", AsyncResult.failure<AuthSessionState, unknown>(Cause.fail("broker"))],
])(
  "delivers Approve and Submit answer to the agent while the session state is %s",
  async (_label, state) => {
    setSessionState(state);
    await using screen = await render(<CloudThreadCards projection={cloudProjection()} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "github.com nexplore" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await act(async () => {});
    expect(sent.map((entry) => entry.label)).toHaveLength(2);
    expect(sent[0]!.value).toMatchObject({
      environmentId: cloud,
      input: { threadId, requestId: approvalId, decision: "accept" },
    });
    expect(sent[1]!.value).toMatchObject({
      environmentId: cloud,
      input: { threadId, requestId: questionId, answers: { registry: "github.com nexplore" } },
    });
  },
);

it("says why when a known read-only connection cannot answer, instead of doing nothing", async () => {
  setSessionState(AsyncResult.success(KNOWN_READ_ONLY));
  using toast = vi.spyOn(toastManager, "add");
  await using screen = await render(<CloudThreadCards projection={cloudProjection()} />);
  await userEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
  expect(sent).toHaveLength(0);
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "Not sent" }));
});

it("says so when Submit answer has no answer yet or the call is interrupted", async () => {
  // A fresh question: answers picked in the tests above are kept per request.
  questionId = RuntimeRequestId.make("unanswered-question");
  setSessionState(AsyncResult.initial<AuthSessionState>(true));
  using toast = vi.spyOn(toastManager, "add");
  await using screen = await render(<CloudThreadCards projection={cloudProjection()} />);
  await userEvent.click(screen.getByRole("button", { name: "Submit answer" }));
  expect(toast).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "error",
      description: expect.stringContaining("Answer every"),
    }),
  );
  interrupt.next = true;
  await userEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
  await act(async () => {});
  expect(toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ description: expect.stringContaining("may not have reached") }),
  );
});
