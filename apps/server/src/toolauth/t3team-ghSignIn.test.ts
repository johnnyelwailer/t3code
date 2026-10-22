// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { GH } from "./t3team-ghAdapter.ts";
import {
  firstFakeState,
  makeService,
  makeTempHome,
  removeTempHome,
  stubProbeRunner,
  stubTimedOutProbeRunner,
  waitFor,
} from "./t3team-toolauthTestHarness.ts";

// The prompt-free output of gh 2.101.0 run with the adapter's spawn env (GH_PROMPT_DISABLED=1,
// NO_COLOR=1) in a pty that answers nothing, captured as the pty delivers it (CRLF). The code and
// URL lines are the verbatim capture. The closing line is gh's own
// "✓ Authentication complete." (the string the adapter has always matched), not part of that capture.
const CODE_LINE = "! One-time code (0749-5FAA) copied to clipboard\r\n";
const urlLine = (host: string) =>
  `Open this URL to continue in your web browser: https://${host}/login/device\r\n`;
const COMPLETE_LINE = "✓ Authentication complete.\r\n";

const LOGGED_IN = (host: string) =>
  `${host}\n  ✓ Logged in to ${host} account octocat (keyring)\n  - Active account: true\n`;

const phaseIs = (service: Parameters<typeof firstFakeState>[0], phase: string, tool = "gh") =>
  service.list.pipe(Effect.map((states) => states.find((s) => s.tool === tool)?.phase === phase));

// `it.live`: these settle through real file and process-runner I/O (the status probe), which a
// virtual clock never advances `waitFor`'s polling past.
describe("gh sign-in", () => {
  it.live("drives gh 2.101 prompt-free output through to connected without typing anything", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir, { tools: ["gh"] });
        yield* service.start("gh");
        const process = ptyAdapter.processes[0]!;

        // The env gh needs not to wait on terminal queries and prompts a silent pty never answers.
        expect(ptyAdapter.spawnInputs[0]?.env).toEqual(
          expect.objectContaining({ GH_PROMPT_DISABLED: "1", NO_COLOR: "1" }),
        );

        // Split mid-line, as a pty read can be.
        process.emitData(CODE_LINE.slice(0, 20));
        process.emitData(CODE_LINE.slice(20));
        process.emitData(urlLine("nexplore.ghe.com"));
        yield* waitFor(phaseIs(service, "awaiting-open"));
        const open = (yield* service.list)[0];
        expect(open?.displayCode).toBe("0749-5FAA");
        expect(open?.url).toBe("https://nexplore.ghe.com/login/device");
        // There is no Enter prompt in this output, so nothing is ever written to gh.
        expect(process.writes).toEqual([]);

        process.emitData(COMPLETE_LINE);
        yield* waitFor(phaseIs(service, "connected"));
        process.emitExit({ exitCode: 0, signal: null });
        yield* Effect.yieldNow;
        expect((yield* service.list)[0]?.phase).toBe("connected");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.live("signs in to the host asked for, not only the default login host", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir, { tools: ["gh"] });
        const started = yield* service.start("gh", { hostname: "github.com" });
        expect(started.hostname).toBe("github.com");
        expect(ptyAdapter.spawnInputs[0]?.args).toEqual([
          "auth",
          "login",
          "--hostname",
          "github.com",
          "--web",
          "--git-protocol",
          "https",
        ]);

        const process = ptyAdapter.processes[0]!;
        process.emitData(CODE_LINE);
        process.emitData(urlLine("github.com"));
        yield* waitFor(phaseIs(service, "awaiting-open"));
        const open = (yield* service.list)[0];
        expect(open?.url).toBe("https://github.com/login/device");
        expect(open?.hostname).toBe("github.com");

        process.emitData("✓ Logged in to github.com account octocat (keyring)\r\n");
        yield* waitFor(phaseIs(service, "connected"));
        expect((yield* service.list)[0]?.hostname).toBe("github.com");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.live("a sign-in running for another host is replaced, not joined", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir, { tools: ["gh"] });
        yield* service.start("gh");
        const second = yield* service.start("gh", { hostname: "github.com" });
        expect(second.hostname).toBe("github.com");
        expect(ptyAdapter.processes).toHaveLength(2);
        expect(ptyAdapter.processes[0]!.killed).toBe(true);
        // The same host again joins the running flow.
        yield* service.start("gh", { hostname: "github.com" });
        expect(ptyAdapter.processes).toHaveLength(2);
        // The abandoned process is inert.
        ptyAdapter.processes[0]!.emitData(COMPLETE_LINE);
        yield* Effect.yieldNow;
        expect((yield* service.list)[0]?.phase).toBe("starting");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.live("a tool that signs in to one host only refuses another", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        const error = yield* Effect.flip(service.start("fake", { hostname: "github.com" }));
        expect(error._tag).toBe("ToolAuthSpawnError");
        expect(ptyAdapter.processes).toHaveLength(0);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  describe("a clean exit with no success line", () => {
    it.live("is connected when gh's own status says the host is signed in", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["gh"] },
            stubProbeRunner(LOGGED_IN(GH.hostname!), calls),
          );
          yield* service.start("gh");
          const process = ptyAdapter.processes[0]!;
          process.emitData(CODE_LINE);
          process.emitData(urlLine(GH.hostname!));
          process.emitExit({ exitCode: 0, signal: null });
          yield* waitFor(phaseIs(service, "connected"));
          expect((yield* service.list)[0]?.account).toBe("octocat");
          expect(calls.some((call) => call.args[0] === "auth" && call.args[1] === "status")).toBe(
            true,
          );
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.live("is failed when gh is signed in to a different host only", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["gh"] },
            stubProbeRunner(LOGGED_IN("elsewhere.example.com")),
          );
          yield* service.start("gh");
          ptyAdapter.processes[0]!.emitExit({ exitCode: 0, signal: null });
          yield* waitFor(phaseIs(service, "failed"));
          expect((yield* service.list)[0]?.message).toBe(
            `GitHub finished without signing in to ${GH.hostname}.`,
          );
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });

  it.live(
    "a clean exit is not connected when the probe hangs and hosts.yml names another host",
    () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const hosts = NodePath.join(homeDir, GH.status.credentialPath);
          NodeFS.mkdirSync(NodePath.dirname(hosts), { recursive: true });
          NodeFS.writeFileSync(hosts, "other.example.com:\n  user: octocat\n");
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["gh"] },
            stubTimedOutProbeRunner(),
          );
          yield* service.start("gh");
          ptyAdapter.processes[0]!.emitExit({ exitCode: 0, signal: null });
          yield* waitFor(phaseIs(service, "failed"));
        } finally {
          removeTempHome(homeDir);
        }
      }),
  );

  describe("a finished in-app sign-in does not outlive gh's own status", () => {
    const SIGNED_OUT = "You are not logged into any GitHub hosts. To log in, run: gh auth login\n";
    const TIMEOUT_LINE = (host: string) => `✗ Timeout trying to log in to ${host} using token\r\n`;

    it.live.each([GH.hostname!, "github.com"])(
      "a failed sign-in to %s reads connected once gh is signed in outside",
      (host) =>
        Effect.gen(function* () {
          const homeDir = makeTempHome();
          try {
            let status = SIGNED_OUT;
            const { service, ptyAdapter } = yield* makeService(
              homeDir,
              { tools: ["gh"] },
              stubProbeRunner(() => status),
            );
            yield* service.start("gh", { hostname: host });
            const process = ptyAdapter.processes[0]!;
            process.emitData(TIMEOUT_LINE(host));
            process.emitExit({ exitCode: 1, signal: null });
            yield* waitFor(phaseIs(service, "failed"));

            status = LOGGED_IN(host);
            const [state] = yield* service.list;
            expect(state).toMatchObject({ phase: "connected", hostname: host, account: "octocat" });
            expect((yield* service.list)[0]?.hostname).toBe(host);
          } finally {
            removeTempHome(homeDir);
          }
        }),
    );

    it.live("a failed sign-in keeps its reason while gh is still signed out", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["gh"] },
            stubProbeRunner(SIGNED_OUT),
          );
          yield* service.start("gh");
          ptyAdapter.processes[0]!.emitData(TIMEOUT_LINE(GH.hostname!));
          ptyAdapter.processes[0]!.emitExit({ exitCode: 1, signal: null });
          yield* waitFor(phaseIs(service, "failed"));
          const [state] = yield* service.list;
          expect(state?.phase).toBe("failed");
          expect(state?.message).toMatch(/timeout trying to log in/i);
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.live("a connected sign-in reads signed out once gh logs out outside", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          let status = LOGGED_IN(GH.hostname!);
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["gh"] },
            stubProbeRunner(() => status),
          );
          yield* service.start("gh");
          ptyAdapter.processes[0]!.emitData(COMPLETE_LINE);
          ptyAdapter.processes[0]!.emitExit({ exitCode: 0, signal: null });
          yield* waitFor(phaseIs(service, "connected"));

          status = SIGNED_OUT;
          expect((yield* service.list)[0]?.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });

  it.live("a status read names the host it is about", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service } = yield* makeService(
          homeDir,
          { tools: ["gh"] },
          stubProbeRunner(LOGGED_IN(GH.hostname!)),
        );
        const [state] = yield* service.list;
        expect(state?.phase).toBe("connected");
        expect(state?.hostname).toBe(GH.hostname);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );
});
