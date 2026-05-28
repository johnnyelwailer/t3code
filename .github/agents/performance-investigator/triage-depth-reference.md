# Triage Depth Reference

## Default Optimization Depth

- Prioritize biggest offenders first, then move downstream only if needed.

## Depth Modes

- Biggest offenders only:
  - Stop once top hotspot is materially reduced and user objective is met.
- Extended pass:
  - Continue to next-tier hotspots when user requests deeper optimization.
- Exhaustive:
  - Pursue micro-hotspots only on explicit request and with clear ROI.

## Noise Control

- If gains are within measurement noise, increase sample stability before adding fixes.
- Prefer repeated same-path measurements over broad speculative edits.
