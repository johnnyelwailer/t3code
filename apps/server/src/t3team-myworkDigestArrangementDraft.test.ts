import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { readDigestArrangement } from "./t3team-myworkDigestArrangement.ts";
import {
  attachDigestArrangementOverlay,
  discardDigestDraft,
  promoteDigestDraft,
  readDigestDraft,
  resetDigestArrangement,
  storeDigestDraft,
  storeMyWorkLiveArrangement,
} from "./t3team-myworkDigestArrangementDraft.ts";
import type { T3TeamMyWorkDigestPayload } from "./t3team-myworkDigestTypes.ts";
import { readViewArrangement, storeViewArrangement } from "./t3team-viewArrangement.ts";

const identity = { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES" };
const scope = "project:app-1";
const input = {
  scope: "project" as const,
  projects: [
    {
      account: { id: "acct-1", provider: "atlassian" },
      externalProjectId: "IES",
      appProjectId: "app-1",
    },
  ],
};
const payload: T3TeamMyWorkDigestPayload = { scope: "project", projects: [], viewer: {} };

const plan = (heading: string) => ({
  producer: "agent",
  producedAt: "2026-10-06T08:00:00.000Z",
  sections: [
    {
      id: "now",
      kind: "items",
      widget: "my-work.tickets",
      placement: "main",
      heading,
      items: [{ ticketId: "t-1" }],
    },
  ],
});

const widgetSection = (widgetHtml: string) => ({
  id: "count",
  kind: "widget",
  placement: "side",
  heading: "Open count",
  items: [],
  widgetHtml,
});

it.layer(SqlitePersistenceMemory)("t3team My Work draft arrangement", (it) => {
  it.effect("a draft sits beside the live plan and both reach the payload", () =>
    Effect.gen(function* () {
      yield* storeMyWorkLiveArrangement(identity, scope, plan("Live"));
      yield* storeDigestDraft(identity, scope, plan("Draft"));

      const overlaid = yield* attachDigestArrangementOverlay(input, payload);
      assert.equal(overlaid.arrangement?.sections[0]?.heading, "Live");
      assert.equal(overlaid.draftArrangement?.sections[0]?.heading, "Draft");
      // The live write mirrors the legacy table that older readers use.
      assert.equal((yield* readDigestArrangement(identity, scope))?.sections[0]?.heading, "Live");
    }),
  );

  it.effect("promote makes the draft live and clears it; promoting nothing fails", () =>
    Effect.gen(function* () {
      yield* storeDigestDraft(identity, scope, plan("Kept"));
      yield* promoteDigestDraft(identity, scope);

      const overlaid = yield* attachDigestArrangementOverlay(input, payload);
      assert.equal(overlaid.arrangement?.sections[0]?.heading, "Kept");
      assert.equal(overlaid.draftArrangement, undefined);

      const again = yield* promoteDigestDraft(identity, scope).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(again));
      assert.include(String(again), "No draft arrangement to promote.");
    }),
  );

  it.effect("discard drops only the draft; reset clears live and draft", () =>
    Effect.gen(function* () {
      yield* storeMyWorkLiveArrangement(identity, scope, plan("Live"));
      yield* storeDigestDraft(identity, scope, plan("Draft"));
      yield* discardDigestDraft(identity, scope);
      assert.equal(yield* readDigestDraft(identity, scope), null);
      assert.equal(
        (yield* attachDigestArrangementOverlay(input, payload)).arrangement?.sections[0]?.heading,
        "Live",
      );

      yield* storeDigestDraft(identity, scope, plan("Draft"));
      yield* resetDigestArrangement(identity, scope);
      const cleared = yield* attachDigestArrangementOverlay(input, payload);
      assert.equal(cleared.arrangement, undefined);
      assert.equal(cleared.draftArrangement, undefined);
    }),
  );

  it.effect("an invalid draft is rejected and leaves the board untouched", () =>
    Effect.gen(function* () {
      const bad = yield* storeDigestDraft(identity, "all", {
        ...plan("x"),
        sections: [{ ...plan("x").sections[0]!, widget: "my-work.nope" }],
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(bad));
      assert.equal(yield* readDigestDraft(identity, "all"), null);
    }),
  );

  it.effect("widget sections carry sandboxed markup and refuse network access", () =>
    Effect.gen(function* () {
      const ok = yield* storeDigestDraft(identity, "all", {
        ...plan("x"),
        sections: [
          widgetSection("<div id=n></div><script>n.textContent=viewData.tickets.length</script>"),
        ],
      });
      assert.equal(ok.sections[0]?.kind, "widget");

      const fetching = yield* storeDigestDraft(identity, "all", {
        ...plan("x"),
        sections: [widgetSection("<script>fetch('/api/x')</script>")],
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(fetching));

      const named = yield* storeDigestDraft(identity, "all", {
        ...plan("x"),
        sections: [{ ...widgetSection("<b>1</b>"), widget: "my-work.tickets" }],
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(named));

      const empty = yield* storeDigestDraft(identity, "all", {
        ...plan("x"),
        sections: [{ ...widgetSection("<b>1</b>"), widgetHtml: undefined }],
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(empty));
    }),
  );

  it.effect("the generic store keys rows by surface, so surfaces never collide", () =>
    Effect.gen(function* () {
      const key = {
        identity: { provider: "atlassian", accountId: "acct-1" },
        scope: "all",
        channel: "live" as const,
      };
      yield* storeViewArrangement({ ...key, surface: "some.other.surface" }, { a: 1 });
      assert.deepEqual(yield* readViewArrangement({ ...key, surface: "some.other.surface" }), {
        a: 1,
      });
      assert.equal(
        yield* readViewArrangement({ ...key, surface: "project.dashboard.myWork" }),
        null,
      );
    }),
  );
});
