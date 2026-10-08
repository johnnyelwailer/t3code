import { describe, expect, it } from "vite-plus/test";

import {
  createProjectSearchFor,
  parseCreateProjectEntryKey,
  parseCreateProjectRouteSearch,
} from "./t3team-createProjectRouteState";
import { parseT3TeamRouteSearch } from "./t3team-routeState";

describe("create-project route state", () => {
  it("round-trips a project through the search param", () => {
    const search = createProjectSearchFor({ accountId: "site-a", externalProjectId: "10001" });
    expect(search).toEqual({ project: "site-a::10001" });
    expect(parseCreateProjectEntryKey(search.project)).toEqual({
      accountId: "site-a",
      externalProjectId: "10001",
    });
  });

  it("keeps everything after the first separator as the external id", () => {
    expect(parseCreateProjectEntryKey("site-a::x::y")).toEqual({
      accountId: "site-a",
      externalProjectId: "x::y",
    });
  });

  it.each(["", "site-a", "::10001", "site-a::"])("rejects the malformed key %j", (key) => {
    expect(parseCreateProjectEntryKey(key)).toBeNull();
    expect(parseCreateProjectRouteSearch({ project: key })).toEqual({});
  });

  it("ignores a non-string project param", () => {
    expect(parseCreateProjectRouteSearch({ project: 42 })).toEqual({});
    expect(parseCreateProjectRouteSearch({})).toEqual({});
  });

  it("is carried by the shared t3team route search", () => {
    expect(parseT3TeamRouteSearch({ project: "site-a::10001" }).project).toBe("site-a::10001");
    expect(parseT3TeamRouteSearch({ project: "nope" }).project).toBeUndefined();
  });
});
