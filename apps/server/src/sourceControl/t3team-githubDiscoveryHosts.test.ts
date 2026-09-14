import { assert, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubSourceControlProvider from "./GitHubSourceControlProvider.ts";

const processResult = (
  stdout: string,
  options?: {
    readonly stderr?: string;
    readonly exitCode?: ChildProcessSpawner.ExitCode;
  },
): VcsProcess.VcsProcessOutput => ({
  exitCode: options?.exitCode ?? ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: options?.stderr ?? "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

/**
 * Fork-level regression for the GHE multi-host discovery contract: a reader signed into
 * `github.com` and a GitHub Enterprise install must keep both hosts after source-control
 * discovery. The singular `host`/`account` fields stay the active-host selection (which is what
 * the host picker defaults to), and the Enterprise host reaches callers through `accounts`
 * rather than being collapsed away by the active-preferred lookup.
 */
it("GitHub discovery surfaces every authenticated host so a host picker can offer them", () => {
  const auth = GitHubSourceControlProvider.discovery.parseAuth(
    processResult(
      JSON.stringify({
        hosts: {
          "github.com": [
            {
              state: "success",
              active: true,
              host: "github.com",
              login: "active-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
          ],
          "nexpore.ghe.com": [
            {
              state: "success",
              active: false,
              host: "nexpore.ghe.com",
              login: "ghe-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
          ],
        },
      }),
    ),
  );

  assert.deepStrictEqual(
    {
      status: auth.status,
      account: auth.account,
      host: auth.host,
    },
    {
      status: "authenticated",
      account: Option.some("active-user"),
      host: Option.some("github.com"),
    },
  );
  assert.deepStrictEqual(auth.accounts, [
    { host: "github.com", account: Option.some("active-user"), active: true },
    { host: "nexpore.ghe.com", account: Option.some("ghe-user"), active: false },
  ]);
});
