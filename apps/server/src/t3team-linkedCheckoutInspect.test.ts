// @effect-diagnostics nodeBuiltinImport:off - a real directory with a .git folder stands in for a checkout.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { inspectLinkedCheckout } from "./t3team-linkedCheckoutInspect.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const checkoutWhereGitSays = (exitCode: number, stderr: string) => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-inspect-"));
  NodeFS.mkdirSync(NodePath.join(directory, ".git"));
  const vcs = Layer.succeed(VcsProcess, {
    run: () =>
      Effect.succeed({
        exitCode: exitCode as never,
        stdout: "",
        stderr,
        stdoutTruncated: false,
        stderrTruncated: false,
      }),
  });
  return {
    inspect: inspectLinkedCheckout(directory).pipe(
      Effect.provide(Layer.mergeAll(vcs, NodeServices.layer)),
      Effect.ensuring(
        Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true })),
      ),
    ),
  };
};

it.effect("does not call a checkout broken because git refused to look at it", () =>
  Effect.gen(function* () {
    const { inspect } = checkoutWhereGitSays(
      128,
      "fatal: detected dubious ownership in repository at 'C:/x'",
    );
    expect(yield* inspect).toBe("unreadable");
  }),
);

it.effect("does not call a checkout broken because another git holds its lock", () =>
  Effect.gen(function* () {
    const { inspect } = checkoutWhereGitSays(
      128,
      "fatal: Unable to create '.git/index.lock': File exists.",
    );
    expect(yield* inspect).toBe("unreadable");
  }),
);

it.effect("still calls a checkout broken when git finds no repository or no HEAD", () =>
  Effect.gen(function* () {
    expect(yield* checkoutWhereGitSays(128, "fatal: not a git repository").inspect).toBe("broken");
    expect(yield* checkoutWhereGitSays(1, "").inspect).toBe("broken");
  }),
);
