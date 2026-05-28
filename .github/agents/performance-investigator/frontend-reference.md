# Frontend Scope Reference

Use for React/Vite/UI-path performance work.

## Typical Symptoms

- High renderer CPU while seemingly idle
- Janky interactions, typing lag, delayed panel open/close
- Excessive rerenders after selection or navigation
- Network churn from repeated effect triggers

## High-Value Checks

- Render-time side effects and state writes
- Unstable dependencies in `useEffect` / `useMemo` / `useCallback`
- Duplicate emissions from providers/hooks
- Recreated objects passed to expensive hooks
- Repeated list animation/layout work (`getBoundingClientRect`, observers)

## Preferred Instrumentation

- Chromium CPU profile on exact user path
- Process CPU snapshot before/after stable idle window
- React rerender attribution via profile hotspots and symbol mapping

## Low-Risk Fix Order

1. Move side effects out of render
2. Guard duplicate updates with equality checks
3. Stabilize identities for hook inputs/dependencies
4. Narrow effect dependencies
5. Defer broad refactors until evidence requires them
