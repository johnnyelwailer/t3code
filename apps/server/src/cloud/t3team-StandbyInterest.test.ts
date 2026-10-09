import { describe, expect, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProjectService } from "../project/ProjectService.ts";
import { CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";
import { projectPoolKeys } from "./t3team-StandbyInterest.ts";

describe("projectPoolKeys", () => {
  it.effect("reports each project with a machine once, and nothing for the rest", () =>
    Effect.gen(function* () {
      const keys = yield* projectPoolKeys.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ProjectService)({
              listShells: () =>
                Effect.succeed(
                  ["a", "b", "c", "d"].map((id) => ({ id: ProjectId.make(id) })) as never,
                ),
            }),
            Layer.mock(CloudSessionMachines)({
              poolKeyOf: (id) =>
                Effect.succeed(
                  ({ a: "acme.api", b: "acme.api", c: null, d: "acme.web" } as const)[
                    id as "a" | "b" | "c" | "d"
                  ],
                ),
            }),
          ),
        ),
      );
      expect(keys).toEqual(["acme.api", "acme.web"]);
    }),
  );
});
