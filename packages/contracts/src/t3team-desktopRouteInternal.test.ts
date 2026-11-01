import { describe, expect, it } from "vite-plus/test";

import {
  isInternalDesktopRouteProposal,
  looksInternalDesktopRouteTarget,
} from "./t3team-desktopRouteInternal.ts";

describe("looksInternalDesktopRouteTarget", () => {
  it.each([
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.1",
    "192.168.1.10",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "localhost",
    "intranet",
    "git.corp",
    "wiki.corp.local",
    "svc.cluster.internal",
    "https://10.1.1.1:8443/path",
    "[::1]",
    "fd00::1",
    "2130706433",
    "10.0.0.0/24",
  ])("%s looks internal", (target) => {
    expect(looksInternalDesktopRouteTarget(target)).toBe(true);
  });

  it.each([
    "registry.npmjs.org",
    "https://github.com/org/repo",
    "8.8.8.8",
    "172.32.0.1",
    "193.5.5.5",
    "npm.nexplore.ch",
  ])("%s looks public", (target) => {
    expect(looksInternalDesktopRouteTarget(target)).toBe(false);
  });
});

describe("isInternalDesktopRouteProposal", () => {
  it("is internal when the agent says so, and the agent cannot clear a private address", () => {
    expect(isInternalDesktopRouteProposal({ target: "npm.nexplore.ch", internal: true })).toBe(
      true,
    );
    expect(isInternalDesktopRouteProposal({ target: "10.2.3.4", internal: false })).toBe(true);
    expect(isInternalDesktopRouteProposal({ target: "registry.npmjs.org", internal: false })).toBe(
      false,
    );
  });
});
