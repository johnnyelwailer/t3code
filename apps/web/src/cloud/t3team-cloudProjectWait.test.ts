import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { type CloudProjectWaitInput, classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import {
  CLOUD_PROJECT_WAIT_EXPECTED_SECONDS,
  CLOUD_PROJECT_WAIT_SLOW_SECONDS,
  cloudProjectWaitDiagnostic,
  cloudProjectWaitSeconds,
  presentCloudProjectWait,
} from "./t3team-cloudProjectWaitPresentation";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { buildCloudSessionSetup } from "./t3team-cloudSessionSetupModel";

const cloud = EnvironmentId.make("env-cloud");
const repoOf = (key: string) => ({
  canonicalKey: key,
  locator: { source: "git-remote" as const, remoteName: "origin", remoteUrl: key },
});
const composer = {
  id: ProjectId.make("p-app"),
  title: "nx-nexi",
  workspaceRoot: "/Users/me/nx-nexi",
  repositoryIdentity: repoOf("ghe/hive/nx-nexi"),
};
const machineProject = (workspaceRoot: string, key: string | null, title = "work") => ({
  title,
  workspaceRoot,
  repositoryIdentity: key === null ? null : repoOf(key),
});

const input = (over: Partial<CloudProjectWaitInput>): CloudProjectWaitInput => ({
  environmentId: cloud,
  scratch: false,
  machineSettingsLoaded: true,
  expectedCwd: "/home/runner/work/nx-nexi",
  scratchRoot: "/home/runner/.t3/scratch",
  composer,
  projects: [],
  ...over,
});

describe("classifyCloudProjectWait", () => {
  it("names every reason the project can be missing on a connected machine", () => {
    const reason = (over: Partial<CloudProjectWaitInput>) =>
      classifyCloudProjectWait(input(over)).reason;
    expect(reason({ machineSettingsLoaded: false })).toBe("machine-settings-pending");
    expect(reason({ scratch: true, scratchRoot: null })).toBe("machine-settings-pending");
    expect(reason({ scratch: true })).toBe("scratch-opening");
    expect(reason({})).toBe("project-list-pending");
    expect(reason({ projects: [machineProject("/srv/other", null)] })).toBe("project-not-listed");
    expect(reason({ expectedCwd: null, projects: [machineProject("/srv/other", null)] })).toBe(
      "no-matching-project",
    );
    expect(
      reason({ projects: [machineProject("/home/runner/work/nx-nexi", "ghe/hive/other")] }),
    ).toBe("different-repository");
    expect(
      reason({
        composer: { ...composer, repositoryIdentity: null },
        projects: [machineProject("/home/runner/work/nx-nexi", null)],
      }),
    ).toBe("different-folder");
    expect(
      reason({ projects: [machineProject("/home/runner/work/nx-nexi", "ghe/hive/nx-nexi")] }),
    ).toBe("no-matching-project");
  });

  it("compares the expected folder to project roots the way the own-project match does", () => {
    const wait = classifyCloudProjectWait(
      input({
        expectedCwd: "/home/runner/work/nx-nexi/",
        projects: [machineProject("/home/runner/work/nx-nexi", null, "nx-nexi")],
      }),
    );
    expect(wait.reason).toBe("no-matching-project");
    expect(wait.machineProjectTitle).toBe("nx-nexi");
  });
});

describe("presentCloudProjectWait", () => {
  const listed = classifyCloudProjectWait(
    input({ projects: [machineProject("/srv/other", null)] }),
  );

  it("is quiet at first, says what is expected, then names the unmet condition", () => {
    const first = presentCloudProjectWait(listed, CLOUD_PROJECT_WAIT_EXPECTED_SECONDS - 1);
    expect(first).toMatchObject({
      level: "waiting",
      detail: "Waiting for the cloud machine to list “nx-nexi”",
      text: null,
      diagnostic: null,
      blocking: false,
    });
    const expected = presentCloudProjectWait(listed, CLOUD_PROJECT_WAIT_EXPECTED_SECONDS);
    expect(expected.level).toBe("expected");
    expect(expected.text).toContain("registers its working folder as its project");
    expect(expected.diagnostic).toBeNull();
    const slow = presentCloudProjectWait(listed, CLOUD_PROJECT_WAIT_SLOW_SECONDS);
    expect(slow.level).toBe("slow");
    expect(slow.text).toContain("Taking longer than usual");
    expect(slow.text).toContain("no project at /home/runner/work/nx-nexi is listed");
    expect(slow.diagnostic).toBe(
      "project-wait reason=project-not-listed environment=env-cloud cwd=/home/runner/work/nx-nexi projects=1",
    );
  });

  it("explains a project of another repository as blocking", () => {
    const wait = classifyCloudProjectWait(
      input({
        projects: [machineProject("/home/runner/work/nx-nexi", "ghe/hive/other", "other")],
      }),
    );
    expect(presentCloudProjectWait(wait, 0)).toMatchObject({
      blocking: true,
      detail: "The machine's project “other” is a different repository than “nx-nexi”",
    });
  });

  it("writes none for a missing folder and singular wording for one project", () => {
    const wait = classifyCloudProjectWait(
      input({ expectedCwd: null, projects: [machineProject("/srv/other", null)] }),
    );
    expect(cloudProjectWaitDiagnostic(wait)).toContain("cwd=none projects=1");
    expect(presentCloudProjectWait(wait, 0).detail).toBe(
      "The machine's only project is not “nx-nexi”",
    );
    const many = classifyCloudProjectWait(
      input({
        expectedCwd: null,
        composer: null,
        projects: [machineProject("/a", null), machineProject("/b", null)],
      }),
    );
    expect(presentCloudProjectWait(many, 0).detail).toBe(
      "None of the machine's 2 projects is this project",
    );
  });
});

describe("cloudProjectWaitSeconds", () => {
  const queued = decodeCloudQueuedSend({
    messageId: "msg-1",
    messageText: "hi",
    outgoingText: "hi",
    titleSeed: "hi",
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    sessionId: "session-9",
    sessionLabel: "machine",
    createdAt: "2026-10-13T08:00:00.000Z",
    stepStartedAt: { project: "2026-10-13T08:02:00.000Z" },
  });

  it("counts from the step's stamp on the card's own clock", () => {
    expect(cloudProjectWaitSeconds(queued ?? undefined, 100)).toBe(0);
    expect(cloudProjectWaitSeconds(queued ?? undefined, 150)).toBe(30);
    expect(cloudProjectWaitSeconds(undefined, 150)).toBe(0);
  });
});

describe("setup card model", () => {
  it("labels the current project step with what it waits on and keeps the wait for the card", () => {
    const wait = classifyCloudProjectWait(input({}));
    const model = buildCloudSessionSetup({
      session: {
        sessionId: "session-9",
        providerKind: "github_actions",
        phase: "ready",
        elapsedSeconds: 150,
        remainingSeconds: null,
        machineLabel: "machine",
        failureReason: null,
        detailsUrl: null,
      },
      machineConnected: true,
      projectReady: false,
      projectWait: wait,
      delivery: "queued",
    });
    expect(model.currentStep).toMatchObject({
      id: "project",
      label: "Waiting for the cloud machine to send its project list",
    });
    expect(model.activity).toBe("Waiting for the cloud machine to send its project list…");
    expect(model.projectWait).toBe(wait);
    expect(
      buildCloudSessionSetup({ ...model, session: null, machineConnected: false }).projectWait,
    ).toBeNull();
  });
});
