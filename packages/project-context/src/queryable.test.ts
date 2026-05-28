import { describe, expect, it } from "vitest";

import { createQueryable, normalizeQueryable, queryableToReadonlyArray } from "./queryable.ts";

describe("Queryable arrays", () => {
  it("provides the MVP queryable contract without mutating Array.prototype", () => {
    const values = createQueryable(["alpha", "beta", "gamma"] as const);

    expect(values.state).toBe("ready");
    expect(values.count()).toBe(3);
    expect(values.first()).toBe("alpha");
    expect(queryableToReadonlyArray(values.where((value) => value.startsWith("b")))).toEqual([
      "beta",
    ]);
    expect(values.some()).toBe(true);
    expect(createQueryable([]).some()).toBe(false);
  });

  it("normalizes legacy arrays and wire objects into queryables", () => {
    expect(normalizeQueryable(["alpha", "beta"]).count()).toBe(2);
    expect(
      queryableToReadonlyArray(
        normalizeQueryable({ state: "loading", items: ["alpha", "beta"] as const }),
      ),
    ).toEqual(["alpha", "beta"]);
  });
});
