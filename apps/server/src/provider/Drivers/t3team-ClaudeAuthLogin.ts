import type { ProviderSetupError } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";

import type * as ProviderAuthFlow from "@t3tools/provider-core/server/providerAuthFlow";
import type * as PtyAdapter from "@t3tools/shared/PtyAdapter";

const TRANSCRIPT_LIMIT = 16_384;

/** Wide enough that the OAuth URL is not wrapped across terminal rows. */
export const CLAUDE_LOGIN_TERMINAL_SIZE = { cols: 200, rows: 30 } as const;

/**
 * Runs the login command in a PTY and mirrors its transcript into the flow's
 * terminal interaction, so the sign-in URL is clickable and a pasted code
 * reaches the CLI. The PTY dies with the enclosing scope, including on cancel.
 */
export const runClaudeLoginTerminal = Effect.fnUntraced(function* (
  input: {
    readonly pty: PtyAdapter.PtyAdapter["Service"];
    readonly spawn: PtyAdapter.PtySpawnInput;
    readonly failure: (operation: string, detail: string, cause?: unknown) => ProviderSetupError;
  },
  context: ProviderAuthFlow.ProviderAuthFlowContext,
) {
  const exited = yield* Deferred.make<number>();
  const output = yield* Queue.sliding<string>(64);
  const process = yield* input.pty
    .spawn(input.spawn)
    .pipe(
      Effect.mapError((cause) =>
        input.failure("start", "Could not open the Claude sign-in terminal.", cause),
      ),
    );
  const detachData = process.onData((data) => {
    Queue.offerUnsafe(output, data.slice(-TRANSCRIPT_LIMIT));
  });
  const detachExit = process.onExit(({ exitCode }) => {
    Deferred.doneUnsafe(exited, Effect.succeed(exitCode));
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      detachData();
      detachExit();
      try {
        process.kill();
      } catch {}
    }),
  );
  let transcript = "";
  let outputOffset = 0;
  const update = () =>
    context.setInteraction(
      { type: "terminal", id: "terminal", output: transcript, outputOffset },
      (response) =>
        response.type === "terminal"
          ? Effect.try({
              try: () => {
                if (response.size) process.resize(response.size.cols, response.size.rows);
                if (response.data) process.write(response.data);
              },
              catch: () =>
                input.failure("respond", "The Claude sign-in terminal is no longer available."),
            })
          : Effect.void,
    );
  yield* update();
  yield* Queue.take(output).pipe(
    Effect.flatMap((data) => {
      outputOffset += data.length;
      transcript = (transcript + data).slice(-TRANSCRIPT_LIMIT);
      return update();
    }),
    Effect.forever,
    Effect.forkScoped,
  );
  if ((yield* Deferred.await(exited)) !== 0)
    return yield* input.failure("start", "The Claude login did not finish successfully.");
});
