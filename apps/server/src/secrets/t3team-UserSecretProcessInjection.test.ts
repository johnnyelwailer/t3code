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
import type { UpstreamFetch } from "./t3team-userSecretRequestForward.ts";
import {
  makeRequestInjection,
  UserSecretRequestInjection,
} from "./t3team-UserSecretRequestInjection.ts";
import { UserSecretResolver } from "./t3team-UserSecretResolver.ts";

const ENV_VALUE = "dummy-env-value-7f3a9c";
const FILE_VALUE = "dummy-file-value-2b8d1e";

const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "user-secret-run-"));
const secrets = NodePath.join(root, "secrets");
NodeFS.mkdirSync(secrets);
const API_VALUE = "dummy-api-value-9e4b70";
const grants: ReadonlyArray<UserSecretGrant> = [
  {
    name: "API_TOKEN",
    kind: "secret",
    deliveryModes: ["requestInjection"],
    destinations: ["*.example.com"],
    approval: "standingGrant",
  },
  {
    name: "ENV_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: ["api.example.com"],
    approval: "standingGrant",
  },
  {
    name: "NEVER_BOUND",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: ["api.example.com"],
    approval: "never",
  },
  {
    name: "FILE_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "never",
  },
  {
    name: "ASK_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "perThread",
  },
];
NodeFS.writeFileSync(
  NodePath.join(secrets, USER_SECRET_GRANTS_FILE),
  JSON.stringify({ version: 1, grants }),
);
NodeFS.writeFileSync(NodePath.join(secrets, "ENV_TOKEN"), ENV_VALUE);
NodeFS.writeFileSync(NodePath.join(secrets, "NEVER_BOUND"), "dummy-never-bound-value");
NodeFS.writeFileSync(NodePath.join(secrets, "API_TOKEN"), API_VALUE);
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
const requestProbe = NodePath.join(root, "request-probe.mjs");
NodeFS.writeFileSync(
  requestProbe,
  [
    "const leaked = Object.values(process.env).some((v) => v.includes('" + API_VALUE + "'));",
    "const response = await fetch(process.env.API_TOKEN_BASE_URL + '/echo');",
    "console.log('env-holds-value', leaked);",
    "console.log('status', response.status, await response.text());",
  ].join("\n"),
);
const requestCommand = `node "${requestProbe}"`;

const upstreamHosts: Array<string> = [];
const echoUpstream: UpstreamFetch = async (url, init) => {
  upstreamHosts.push(new URL(url).host);
  return new Response(`got ${new Headers(init.headers).get("authorization")}`, { status: 200 });
};

const audits: Array<UserSecretUseAudit> = [];
const AuditMemory = Layer.succeed(
  UserSecretAudit,
  UserSecretAudit.of({ record: (entry) => Effect.sync(() => void audits.push(entry)) }),
);
const Resolver = Layer.effect(UserSecretResolver, makeDirectoryResolver(secrets));
const Requests = Layer.effect(UserSecretRequestInjection, makeRequestInjection(echoUpstream));
const layer = UserSecretProcessInjectionLive.pipe(
  Layer.provide(
    Layer.mergeAll(Requests, UserSecretApprovalsLive, AuditMemory, ProcessRunner.layer),
  ),
  Layer.provide(Resolver),
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
        [["declined", "nobody_to_ask", "perThread"]],
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

  live(
    "approval never skips only the prompt: grant, destination, masking and audit still apply",
    () =>
      Effect.gen(function* () {
        audits.length = 0;
        const attended = ThreadId.make("thread-with-a-user");
        const result = yield* run(
          {
            command:
              "node -e \"console.log(require('fs').readFileSync(process.env.FILE_TOKEN_FILE,'utf8'))\"",
            secrets: [{ name: "FILE_TOKEN" }],
            purpose: "probe",
          },
          attended,
        );
        assert.strictEqual(result.stdout.trim(), "****");
        assert.deepStrictEqual(
          audits.map((entry) => [entry.name, entry.outcome, entry.approval, entry.consumer]),
          [["FILE_TOKEN", "used", "never", attended]],
        );
        audits.length = 0;
        const ungranted = yield* Effect.flip(
          run(
            { command: "exit 0", secrets: [{ name: "NOT_GRANTED" }], purpose: "probe" },
            attended,
          ),
        );
        assert.include(ungranted.message, "not granted");
        const elsewhere = yield* Effect.flip(
          run(
            {
              command: "exit 0",
              secrets: [{ name: "NEVER_BOUND" }],
              destination: "attacker.net",
              purpose: "probe",
            },
            attended,
          ),
        );
        assert.include(elsewhere.message, "may not be sent to that host");
        assert.deepStrictEqual(
          audits.map((entry) => [entry.name, entry.outcome, entry.reason]),
          [
            ["NOT_GRANTED", "refused", "not_granted"],
            ["NEVER_BOUND", "refused", "destination_not_allowed"],
          ],
        );
      }),
  );

  live(
    "request injection: the command gets a base URL, never the value, and each request is audited",
    () =>
      Effect.gen(function* () {
        audits.length = 0;
        upstreamHosts.length = 0;
        const result = yield* run({
          command: requestCommand,
          secrets: [{ name: "API_TOKEN", as: "request", destination: "api.example.com" }],
          purpose: "probe",
        });
        assert.strictEqual(result.exitCode, 0, result.stderr);
        assert.include(result.stdout, "env-holds-value false");
        assert.include(result.stdout, "status 200 got Bearer ****");
        assert.notInclude(result.stdout, API_VALUE);
        assert.deepStrictEqual(upstreamHosts, ["api.example.com"]);
        assert.deepStrictEqual(
          audits.map((entry) => [
            entry.name,
            entry.mode,
            entry.destination,
            entry.method,
            entry.status,
          ]),
          [["API_TOKEN", "requestInjection", "api.example.com", "GET", 200]],
        );
        assert.notInclude(JSON.stringify(audits), API_VALUE);
      }),
  );

  live("request injection refuses another host and a wildcard instead of a concrete host", () =>
    Effect.gen(function* () {
      for (const [destination, message] of [
        ["attacker.net", "may not be sent to that host"],
        ["*.example.com", "name the host"],
      ] as const) {
        const error = yield* Effect.flip(
          run({
            command: "exit 0",
            secrets: [{ name: "API_TOKEN", as: "request", destination }],
            purpose: "probe",
          }),
        );
        assert.include(error.message, message);
      }
    }),
  );

  live("a request-only entry cannot be handed over as a file or env value", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run({
          command: "exit 0",
          secrets: [{ name: "API_TOKEN", as: "env" }],
          destination: "api.example.com",
          purpose: "probe",
        }),
      );
      assert.include(error.message, "does not allow this kind of use");
    }),
  );
});
