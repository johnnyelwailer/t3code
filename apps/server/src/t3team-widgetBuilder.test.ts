import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  authorWidgetFromIntent,
  shouldBypassBuilder,
  T3TEAM_WIDGET_BUILDER_UNAVAILABLE,
} from "./t3team-widgetBuilder.ts";

describe("t3team-widgetBuilder", () => {
  it("shouldBypassBuilder is true only when widgetCode is non-empty", () => {
    assert.isTrue(shouldBypassBuilder({ widgetCode: "<div/>" }));
    assert.isFalse(shouldBypassBuilder({ widgetCode: "" }));
  });

  it.effect("authorWidgetFromIntent fails without inventing HTML", () =>
    Effect.gen(function* () {
      const result = yield* authorWidgetFromIntent({
        intent: "Show a chart",
        title: "chart",
        format: "html",
      }).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") {
        assert.strictEqual(result.failure, T3TEAM_WIDGET_BUILDER_UNAVAILABLE);
        assert.include(result.failure, "widget_code");
      }
    }),
  );
});
