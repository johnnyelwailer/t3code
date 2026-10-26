import { describe, expect, it } from "vite-plus/test";

import {
  type CloudSessionListDemand,
  cloudSessionListWanted,
  environmentMayBeCloudSessionMachine,
} from "./t3team-cloudSessionListDemand";

const NOTHING: CloudSessionListDemand = {
  menuOpen: false,
  panelVisible: false,
  bound: false,
  creating: false,
  queuedSendPending: false,
  localSession: false,
  lingering: false,
};

describe("cloudSessionListWanted", () => {
  it("does not want the list for a plain local composer", () => {
    expect(cloudSessionListWanted(NOTHING)).toBe(false);
  });

  it.each(Object.keys(NOTHING) as ReadonlyArray<keyof CloudSessionListDemand>)(
    "wants the list for %s alone",
    (reason) => {
      expect(cloudSessionListWanted({ ...NOTHING, [reason]: true })).toBe(true);
    },
  );
});

describe("environmentMayBeCloudSessionMachine", () => {
  it.each(["RelayConnectionTarget", "BrokerConnectionTarget"])("is possible for a %s", (tag) => {
    expect(environmentMayBeCloudSessionMachine(tag)).toBe(true);
  });

  it.each(["PrimaryConnectionTarget", "SshConnectionTarget", "BearerConnectionTarget", null])(
    "is not possible for %s",
    (tag) => {
      expect(environmentMayBeCloudSessionMachine(tag)).toBe(false);
    },
  );
});
