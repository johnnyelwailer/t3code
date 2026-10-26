// @effect-diagnostics nodeBuiltinImport:off - fixtures write the grant directory and a probe script synchronously.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ThreadId, type UserSecretGrant, type UserSecretUseAudit } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProcessRunner from "../processRunner.ts";
import { UserSecretApprovalsLive } from "./t3team-UserSecretApprovals.ts";
import { UserSecretAudit } from "./t3team-UserSecretAudit.ts";
import {
  makeDirectoryResolver,
  USER_SECRET_GRANTS_FILE,
} from "./t3team-userSecretDirectoryResolver.ts";
import {
  UserSecretProcessInjection,
  UserSecretProcessInjectionLive,
} from "./t3team-UserSecretProcessInjection.ts";
import { UserSecretResolver } from "./t3team-UserSecretResolver.ts";

const ENV_VALUE = "dummy-env-value-7f3a9c";
const FILE_VALUE = "dummy-file-value-2b8d1e";

const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "user-secret-run-"));
const secrets = NodePath.join(root, "secrets");
NodeFS.mkdirSync(secrets);
const grants: ReadonlyArray<UserSecretGrant> = [
  {
    name: "ENV_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: ["api.example.com"],
    approval: "standingGrant",
  },
  {
    name: "FILE_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "automatic",
  },
  {
    name: "ASK_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "oncePerSession",
  },
];
NodeFS.writeFileSync(
  NodePath.join(secrets, USER_SECRET_GRANTS_FILE),
  JSON.stringify({ version: 1, grants }),
);
NodeFS.writeFileSync(NodePath.join(secrets, "ENV_TOKEN"), ENV_VALUE);
NodeFS.writeFileSync(NodePath.join(secrets, "FILE_TOKEN"), FILE_VALUE);
NodeFS.writeFileSync(NodePath.join(secrets, "ASK_TOKEN"), "dummy-ask-value");
NodeFS.writeFileSync(NodePath.join(secrets, "NOT_GRANTED"), "dummy-not-granted");
const probe = NodePath.join(root, "probe.js");
NodeFS.writeFileSync(
  probe,
  [
    'const fs = require("node:fs");',
    "const fromFile = fs.readFileSync(process.env.FILE_TOKEN_FILE, 'utf8');",
    "console.log('env', process.env.ENV_TOKEN);",
    "console.log('file', fromFile);",
    "console.log('b64', Buffer.from('me:' + process.env.ENV_TOKEN).toString('base64'));",
    "console.error('url', encodeURIComponent(fromFile + '/'));",
  ].join("\n"),
);
const command = `node "${probe}"`;

const audits: Array<UserSecretUseAudit> = [];
const AuditMemory = Layer.succeed(
  UserSecretAudit,
  UserSecretAudit.of({ record: (entry) => Effect.sync(() => void audits.push(entry)) }),
);
const Resolver = Layer.effect(UserSecretResolver, makeDirectoryResolver(secrets));
const layer = UserSecretProcessInjectionLive.pipe(
  Layer.provide(
    Layer.mergeAll(Resolver, UserSecretApprovalsLive, AuditMemory, ProcessRunner.layer),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const run = (
  input: Parameters<UserSecretProcessInjection["Service"]["run"]>[0]["input"],
  threadId?: ThreadId,
) =>
  Effect.flatMap(UserSecretProcessInjection, (injection) =>
    injection.run({
      consumerId: threadId ?? "automation-run-1",
      threadId,
      tool: "test-tool",
      cwd: root,
      input,
    }),
  );

/** Spawns real processes, so it runs on the wall clock. */
const live = <E>(name: string, body: () => Effect.Effect<void, E, UserSecretProcessInjection>) =>
  it.live(name, () => body().pipe(Effect.provide(layer)));

describe("process injection", () => {
  live("injects files and env, masks every form, and audits without values", () =>
    Effect.gen(function* () {
      audits.length = 0;
      const result = yield* run({
        command,
        secrets: [{ name: "FILE_TOKEN" }, { name: "ENV_TOKEN", as: "env" }],
        destination: "api.example.com",
        purpose: "probe",
      });
      assert.strictEqual(result.exitCode, 0, result.stderr);
      const output = `${result.stdout}\n${result.stderr}`;
      for (const leak of [
        ENV_VALUE,
        FILE_VALUE,
        Buffer.from(`me:${ENV_VALUE}`).toString("base64"),
        encodeURIComponent(`${FILE_VALUE}/`),
      ]) {
        assert.notInclude(output, leak);
      }
      assert.include(result.stdout, "env ****");
      assert.include(result.stdout, "file ****");
      assert.isAtLeast(result.maskedCount, 4);
      assert.deepStrictEqual(
        audits
          .map((entry) => [entry.name, entry.outcome, entry.consumer, entry.destination])
          .toSorted(),
        [
          ["ENV_TOKEN", "used", "automation-run-1", "api.example.com"],
          ["FILE_TOKEN", "used", "automation-run-1", "api.example.com"],
        ],
      );
      assert.notInclude(JSON.stringify(audits), ENV_VALUE);
      assert.notInclude(JSON.stringify(audits), FILE_VALUE);
    }),
  );

  live("refuses an ungranted name before running anything, and audits the refusal", () =>
    Effect.gen(function* () {
      audits.length = 0;
      const error = yield* Effect.flip(
        run({ command: "exit 0", secrets: [{ name: "NOT_GRANTED" }], purpose: "probe" }),
      );
      assert.include(error.message, "NOT_GRANTED is not granted");
      assert.deepStrictEqual(
        audits.map((entry) => [entry.name, entry.outcome, entry.reason]),
        [["NOT_GRANTED", "refused", "not_granted"]],
      );
    }),
  );

  live("refuses a destination outside the entry's hosts", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run({
          command: "exit 0",
          secrets: [{ name: "ENV_TOKEN", as: "env" }],
          destination: "attacker.net",
          purpose: "probe",
        }),
      );
      assert.include(error.message, "may not be sent to that host");
    }),
  );

  live("declines an unattended use that needs a prompt, without waiting", () =>
    Effect.gen(function* () {
      audits.length = 0;
      const error = yield* Effect.flip(
        run({ command: "exit 0", secrets: [{ name: "ASK_TOKEN" }], purpose: "probe" }),
      );
      assert.include(error.message, "standing grant");
      assert.deepStrictEqual(
        audits.map((entry) => [entry.outcome, entry.reason, entry.approval]),
        [["declined", "nobody_to_ask", "oncePerSession"]],
      );
    }),
  );

  live("refuses two secrets that would set the same variable", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run({
          command: "exit 0",
          secrets: [
            { name: "FILE_TOKEN", variable: "X" },
            { name: "FILE_TOKEN", as: "env", variable: "X" },
          ],
          purpose: "probe",
        }),
      );
      assert.include(error.message, "Two secrets would set X");
    }),
  );
});
