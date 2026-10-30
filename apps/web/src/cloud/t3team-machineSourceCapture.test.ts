import {
  EnvironmentId,
  MACHINE_SOURCE_ACCEPT_LABEL,
  ProjectId,
  MACHINE_SOURCE_QUESTION_HEADER,
  encodeMachineSourceQuestionId,
  machineSourceQuestionLine,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { captureMachineSourceApply } from "./t3team-machineSourceCapture";

const LOCAL = EnvironmentId.make("env-local");
const CLOUD = EnvironmentId.make("env-cloud");
const identity = (key: string) =>
  ({
    canonicalKey: key,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "x" },
  }) as never;
const project = (environmentId: EnvironmentId, id: string, title: string, key: string) => ({
  environmentId,
  id: ProjectId.make(id),
  title,
  workspaceRoot: `/${id}`,
  repositoryIdentity: identity(key),
});

const setting = { repository: "https://nexplore.ghe.com/acme/tools.git", branch: "setup" };
const questionId = encodeMachineSourceQuestionId(setting);
const question = {
  id: questionId,
  header: MACHINE_SOURCE_QUESTION_HEADER,
  question: machineSourceQuestionLine(setting),
};
const answers = { [questionId]: MACHINE_SOURCE_ACCEPT_LABEL };
const projects = [
  project(LOCAL, "api-local", "API", "nexplore.ghe.com/acme/api"),
  project(CLOUD, "api-cloud", "repository", "nexplore.ghe.com/acme/api"),
  project(LOCAL, "web-local", "Web", "nexplore.ghe.com/acme/web"),
  project(CLOUD, "web-cloud", "repository", "nexplore.ghe.com/acme/web"),
];
const capture = (projectId: string) =>
  captureMachineSourceApply({
    questions: [question],
    answers,
    thread: { environmentId: CLOUD, projectId: ProjectId.make(projectId) },
    primaryEnvironmentId: LOCAL,
    projects,
  });

describe("captureMachineSourceApply", () => {
  it("fixes the target to the project of the thread that was answered", () => {
    const answered = capture("api-cloud");
    // The composer then shows another project's thread: the capture is data, not a lookup.
    const other = capture("web-cloud");
    expect(answered?.target).toMatchObject({ kind: "project", project: { id: "api-local" } });
    expect(other?.target).toMatchObject({ kind: "project", project: { id: "web-local" } });
    expect(answered?.target).toMatchObject({ kind: "project", project: { id: "api-local" } });
  });

  it("carries the accepted proposal", () => {
    expect(capture("api-cloud")?.source).toEqual({
      repository: "https://nexplore.ghe.com/acme/tools.git",
      branch: "setup",
    });
  });

  it("is null when the answer is not an accepted proposal", () => {
    expect(
      captureMachineSourceApply({
        questions: [question],
        answers: { [questionId]: "Keep the default" },
        thread: { environmentId: CLOUD, projectId: ProjectId.make("api-cloud") },
        primaryEnvironmentId: LOCAL,
        projects,
      }),
    ).toBeNull();
  });
});
