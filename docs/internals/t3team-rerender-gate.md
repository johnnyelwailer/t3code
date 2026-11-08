# Re-render gate

After any interaction or data change, only the UI that changed may re-render.
The gate enforces this by requiring a re-render test for each interactive
component a pull request touches.

## Rule

- Touching an interactive component requires a sibling `Name.rerender.test.tsx`.
- The test must use the shared `renderCounter` helper.
- The test's assertion is the render budget.
- A budget overage fails the test.
- No separate budget file exists.
- The gate runs on pull requests.
- The gate fails when the test is missing.
- One exemption line can waive a pull request.
- The line must appear in the pull request body.
- Format: `Rerender: n/a, <reason>`.
- The reason names what cannot re-render wrongly.
- One-word reasons are rejected.

## Interactive component heuristic

A pull-request-touched `.tsx` file under `apps/web/src` is gated when it shows
at least one signal:

| Signal | Pattern                                                              | Meaning               |
| ------ | -------------------------------------------------------------------- | --------------------- |
| state  | `useState(` / `useReducer(`                                          | holds local state     |
| store  | `useAtom*( ` / `useStore(` / `useShallow(` / `useSyncExternalStore(` | subscribes to a store |
| list   | `{items.map(`                                                        | renders a list        |

Out of scope:

- Test files and story files.
- The `components/ui/` design system.
- Files outside `apps/web/src`.

## Using the helper

Count inside a memoized per-item wrapper, the same barrier that protects the
list:

```tsx
import { memo } from "react";
import { renderCounter } from "~/test/t3team-renderCounter";

const counter = renderCounter();

const CountingRow = memo(function CountingRow(props: { rowId: string }) {
  counter.count(props.rowId);
  return <ThreadRowItem ... />;
});
```

```tsx
counter.reset();
await act(async () => select("thread-1"));
counter.expectRerendered({ "row-0": 1, "row-1": 1 });
```

- The wrapper takes only referentially-stable props.
- It bails out exactly when the row does.
- `expectRerendered` asserts the exact counts since the reset.
- It fails on extra and missing entries.
- Wrap the real item inside the counting wrapper.

## Exemption

- Use it when a re-render test cannot fail usefully.
- Name the component and why it cannot re-render wrongly.
- Example: `Rerender: n/a, static settings table with no shared state`.

## Running the gate

- The gate is `t3team-rerender-gate.mjs` at the repo root.
- The workflow is `.github/workflows/t3team-rerender-gate.yml`.
- Local run:

```bash
git diff --name-only --diff-filter=ACMR <base> HEAD > changed.txt
node t3team-rerender-gate.mjs --files changed.txt --body pr-body.txt
```
