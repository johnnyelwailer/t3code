/**
 * The setup card re-renders every second while a session is setting up. The overflow is the card's
 * only list, so its memo barrier is the budget: a card tick with the same items must not re-render
 * it, a changed item set must. Rule: docs/internals/t3team-rerender-gate.md.
 */
import { memo, useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { renderCounter } from "~/test/t3team-renderCounter";
import { render } from "../../test/render";
import {
  CloudSetupOverflowMenu,
  type CloudSetupOverflowItem,
} from "./t3team-CloudSetupOverflowMenu";

const counter = renderCounter();

const CountingOverflow = memo(function CountingOverflow(props: {
  readonly items: ReadonlyArray<CloudSetupOverflowItem>;
}) {
  counter.count("overflow");
  return <CloudSetupOverflowMenu items={props.items} />;
});

const CANCEL: CloudSetupOverflowItem = { id: "cancel", label: "Cancel message" };
const DETAILS: CloudSetupOverflowItem = { id: "details", label: "See what happened" };
const ONE_ITEM = [CANCEL];
const TWO_ITEMS = [CANCEL, DETAILS];

/** `elapsed` stands in for the card's per-second clock: it changes, the items do not. */
function Harness() {
  const [elapsed, setElapsed] = useState(0);
  const [withDetails, setWithDetails] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setElapsed((value) => value + 1)}>
        tick {elapsed}
      </button>
      <button type="button" onClick={() => setWithDetails(true)}>
        grow
      </button>
      <CountingOverflow items={withDetails ? TWO_ITEMS : ONE_ITEM} />
    </div>
  );
}

describe("CloudSetupOverflowMenu re-renders", () => {
  it("sits out the card's clock and follows only its own items", async () => {
    await using screen = await render(<Harness />, { router: false });
    expect(screen.container.querySelector("[data-cloud-setup-overflow]")).not.toBeNull();

    counter.reset();
    await page.getByRole("button", { name: "tick 0" }).click();
    counter.expectRerendered({});

    await page.getByRole("button", { name: "grow" }).click();
    counter.expectRerendered({ overflow: 1 });
  });
});
