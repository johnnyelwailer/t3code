import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError, ProviderTurnId } from "@t3tools/contracts";
import type { ProviderAdapterV2Event } from "@t3tools/provider-core/server/ProviderAdapter";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { RemoteEnvironmentError } from "./t3team-remoteEnvironmentApiTypes.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";
import {
  fakeRemote,
  open,
  providerThread,
  turn,
  view,
} from "./t3team-remoteEnvironmentSession.fixtures.ts";

const terminalOf = (events: ReadonlyArray<ProviderAdapterV2Event>) =>
  events.find((event) => event.type === "turn.terminal");

const runUntilTerminal = <E>(events: Stream.Stream<ProviderAdapterV2Event, E>) =>
  events.pipe(
    Stream.takeUntil((event) => event.type === "turn.terminal"),
    Stream.runCollect,
  );

describe("makeRemoteEnvironmentSession", () => {
  it.live("runs the turn on the remote thread and completes with its answer", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      yield* Deferred.await(remote.dispatched);
      yield* Ref.set(remote.state, view("completed", ["All tests pass."]));
      yield* Queue.offer(remote.ticks, undefined);
      const events = yield* runUntilTerminal(session.events);
      const terminal = terminalOf(events);
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "completed");
      const final = events.filter(
        (event) => event.type === "message.updated" && !event.message.streaming,
      );
      assert.isTrue(
        final.some(
          (event) => event.type === "message.updated" && event.message.text === "All tests pass.",
        ),
      );
      assert.deepStrictEqual(yield* Ref.get(remote.log), [
        "launch:thread-child:remote-project",
        `dispatch:${turn.message.messageId}:Standard`,
      ]);
    }).pipe(Effect.scoped),
  );

  it.live("fails the turn when the model is not offered there, and substitutes nothing", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({ models: ["Instant"] });
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(
          terminal.failure.message,
          /Model 'Standard' of provider 'nexplore' is not available/,
        );
      }
      assert.deepStrictEqual(yield* Ref.get(remote.log), []);
    }).pipe(Effect.scoped),
  );

  it.live("fails the turn when the session's own project is another repository", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({ repository: "nexplore.ghe.com/foo/nexi-machine-qa" });
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /own project is not/);
      }
    }).pipe(Effect.scoped),
  );

  it.live("fails with a clear reason when the session ends mid-turn", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const failures = yield* Ref.make<
        ReadonlyArray<CloudSessionFailedError | RemoteEnvironmentError>
      >([]);
      const session = yield* open(remote, failures);
      yield* session.startTurn(turn);
      yield* Deferred.await(remote.dispatched);
      yield* Ref.set(failures, [
        new CloudSessionFailedError({
          reason: "session_ended",
          message: "That cloud session has ended.",
        }),
      ]);
      yield* Queue.fail(remote.ticks, new RemoteEnvironmentError({ message: "socket closed" }));
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.strictEqual(
          terminal.failure.message,
          "The cloud session ended before the child finished.",
        );
      }
    }).pipe(Effect.scoped),
  );

  it.live("ends the local turn as interrupted when the remote run is interrupted there", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      yield* Deferred.await(remote.dispatched);
      yield* Ref.set(remote.state, view("interrupted"));
      yield* Queue.offer(remote.ticks, undefined);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "interrupted");
    }).pipe(Effect.scoped),
  );

  it.live("a local interrupt interrupts the remote run", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      yield* Deferred.await(remote.observed);
      yield* session.interruptTurn({
        providerThread,
        providerTurnId: ProviderTurnId.make(`provider-turn:${turn.attemptId}`),
      });
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "interrupted");
      yield* Deferred.await(remote.remoteInterrupted);
      assert.isTrue((yield* Ref.get(remote.log)).includes("interrupt:remote-run-1"));
    }).pipe(Effect.scoped),
  );

  it.live("fails rather than waits when the remote run asks for an approval", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({ afterDispatch: view("waiting", [], true) });
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /approval/);
      }
    }).pipe(Effect.scoped),
  );

  it.live("refuses a turn with attachments instead of dropping them", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const session = yield* open(remote);
      yield* session.startTurn({
        ...turn,
        message: {
          ...turn.message,
          attachments: [
            {
              type: "image",
              id: "attachment-1",
              name: "screen.png",
              mimeType: "image/png",
              sizeBytes: 10,
            },
          ],
        },
      });
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /Attachments cannot be sent to a cloud session/);
      }
      assert.deepStrictEqual(yield* Ref.get(remote.log), []);
    }).pipe(Effect.scoped),
  );

  it.live("a refused authorization fails the turn with its reason and touches nothing remote", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({});
      const session = yield* open(remote, null, () =>
        Effect.fail(
          new RemoteEnvironmentRejected({
            reason: "placement",
            message:
              "This thread was not placed on a cloud session by delegate_task on this server.",
          }),
        ),
      );
      yield* session.startTurn(turn);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /was not placed on a cloud session/);
      }
      assert.deepStrictEqual(yield* Ref.get(remote.log), []);
    }).pipe(Effect.scoped),
  );

  it.live("refuses a session whose own project has no repository identity", () =>
    Effect.gen(function* () {
      const remote = yield* fakeRemote({ noIdentity: true });
      const session = yield* open(remote);
      yield* session.startTurn(turn);
      const terminal = terminalOf(yield* runUntilTerminal(session.events));
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /has no repository identity/);
      }
    }).pipe(Effect.scoped),
  );
});
