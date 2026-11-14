import { describe, expect, it } from "vite-plus/test";

import { plainProjectFolderName } from "@t3tools/contracts";
import { bootstrapProjectTitle } from "./t3team-cloudSessionBootstrapTitle.ts";

const path = {
  basename: (p: string) => p.slice(p.lastIndexOf("/") + 1),
  dirname: (p: string) => p.slice(0, p.lastIndexOf("/")),
  resolve: (...segments: string[]) => segments.join("/").replace(/\/+/g, "/"),
};
const baseDir = "/home/runner/t3";
const folder = plainProjectFolderName("Nexi AI", "0b9c1e7a-1234-4c4c-9c9c-123456789abc");

describe("bootstrapProjectTitle", () => {
  it("names a plain session's project after its title, not its folder's id suffix", () => {
    expect(folder).toMatch(/^Nexi AI-[0-9a-f]{8}$/);
    const cwd = `${baseDir}/projects/${folder}`;
    expect(bootstrapProjectTitle({ repositoryName: undefined, cwd, baseDir, path })).toBe(
      "Nexi AI",
    );
  });

  it("prefers the repository's name", () => {
    const cwd = `${baseDir}/projects/${folder}`;
    expect(bootstrapProjectTitle({ repositoryName: "nx-nexi", cwd, baseDir, path })).toBe(
      "nx-nexi",
    );
  });

  it("keeps a folder outside the projects root as it is", () => {
    const cwd = "/work/release-1a2b3c4d";
    expect(bootstrapProjectTitle({ repositoryName: undefined, cwd, baseDir, path })).toBe(
      "release-1a2b3c4d",
    );
  });

  it("keeps a projects-root folder without the suffix as it is", () => {
    const cwd = `${baseDir}/projects/My app`;
    expect(bootstrapProjectTitle({ repositoryName: undefined, cwd, baseDir, path })).toBe("My app");
  });
});
