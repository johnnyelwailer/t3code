/**
 * The user's choice of where a project's machine definition is read from: a repository and a
 * branch, kept in the project's state dir (`.t3team/machine-source.json`, next to
 * `recipe-triggers.json`). Absent file = the default (the project's own repository, its default
 * branch). A corrupt file reads as the default; a write always replaces it with a well-formed one.
 * Only names are stored: a repository URL carrying credentials is refused.
 *
 * @module t3team-projectMachineSourceSetting
 */
import type { ProjectMachineSourceSetting } from "@t3tools/contracts";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { machineRepositoryFromRemote } from "../cloud/t3team-cloudSessionMachineNames.ts";

export const MACHINE_SOURCE_FILE = "machine-source.json";

/** A normalized choice: `url` is always the https clone URL, never absent when a repository was chosen. */
export interface MachineSourceChoice {
  readonly url?: string;
  readonly branch?: string;
}

const SHORTHAND = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
// git check-ref-format, minus what makes no sense for a branch a person types.
const FORBIDDEN_BRANCH = /[\u0000- \u007f~^:?*[\\]|\.\.|@\{|\/\/|\.lock(\/|$)|^[-/]|[/.]$/;

const isValidBranchName = (branch: string): boolean =>
  branch.length > 0 && branch !== "@" && !FORBIDDEN_BRANCH.test(branch);

/** `owner/repo` shorthand resolves on the host of `ownUrl`; anything else must be an https URL. */
export function normalizeMachineSource(
  input: ProjectMachineSourceSetting,
  ownUrl: string | undefined,
): { readonly choice: MachineSourceChoice } | { readonly error: string } {
  const branch = input.branch?.trim();
  if (branch !== undefined && !isValidBranchName(branch)) {
    return { error: `"${branch}" is not a valid branch name.` };
  }
  const raw = input.repository?.trim();
  let url: string | undefined;
  if (raw !== undefined && raw.length > 0) {
    let candidate = raw;
    if (SHORTHAND.test(raw)) {
      const host = ownUrl === undefined ? null : machineRepositoryFromRemote(ownUrl)?.host;
      if (host === null || host === undefined) {
        return {
          error:
            "Name the repository as a full https URL: this project has no remote to take the host from.",
        };
      }
      candidate = `https://${host}/${raw}`;
    }
    const parsed = URL.parse(candidate);
    if (parsed === null || parsed.protocol !== "https:") {
      return {
        error: "The repository must be an https URL (https://host/owner/repo) or owner/repo.",
      };
    }
    if (
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return { error: "The repository URL must not contain credentials, a query or a fragment." };
    }
    const repository = machineRepositoryFromRemote(candidate);
    if (repository === null) {
      return { error: "The repository must look like https://host/owner/repo." };
    }
    url = repository.url;
  }
  return {
    choice: { ...(url === undefined ? {} : { url }), ...(branch === undefined ? {} : { branch }) },
  };
}

const settingPath = (workspaceRoot: string, path: Path.Path) =>
  path.join(workspaceRoot, PROJECT_STATE_DIR, MACHINE_SOURCE_FILE);

const SettingDoc = Schema.Struct({
  version: Schema.Literal(1),
  url: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
});
const decodeDoc = Schema.decodeUnknownOption(Schema.fromJsonString(SettingDoc));
const encodeDoc = Schema.encodeSync(Schema.fromJsonString(SettingDoc));

export const readMachineSource = Effect.fn("projectMachine.readSource")(function* (
  workspaceRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(settingPath(workspaceRoot, path)).pipe(Effect.option);
  if (text._tag === "None") return null;
  const doc = Option.getOrNull(decodeDoc(text.value));
  if (doc === null) return null;
  const url = doc.url !== undefined && doc.url.length > 0 ? doc.url : undefined;
  const branch = doc.branch !== undefined && isValidBranchName(doc.branch) ? doc.branch : undefined;
  return url === undefined && branch === undefined
    ? null
    : ({
        ...(url === undefined ? {} : { url }),
        ...(branch === undefined ? {} : { branch }),
      } satisfies MachineSourceChoice);
});

/** `null` (or an empty choice) resets to the default by removing the file. */
export const writeMachineSource = Effect.fn("projectMachine.writeSource")(function* (
  workspaceRoot: string,
  choice: MachineSourceChoice | null,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = settingPath(workspaceRoot, path);
  if (choice === null || (choice.url === undefined && choice.branch === undefined)) {
    yield* fs.remove(file, { force: true });
    return;
  }
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, `${encodeDoc({ version: 1, ...choice })}\n`);
});
