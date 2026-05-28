# Validation Policy Reference

## Baseline Rule

- Always provide measured before/after for the same scenario.

## Check Levels

- Focused checks: Use when user asks for fast iteration or targeted fix.
- Full gates: Required as final check before declaring complete.

## Final Check Requirement

- Run full repo gates at the end:
  - format
  - lint
  - typecheck

## Reporting

- Explicitly state which checks were run.
- If any check is skipped or blocked, explain why and provide alternative evidence.
