# Electron Scope Reference

Use for Electron main/renderer process performance and desktop-specific repro.

## Typical Symptoms

- Electron process high CPU at idle
- Renderer spikes after route transitions
- Main-process scheduling or IPC churn
- Auth/bootstrap/proxy mismatches causing noisy retry loops

## High-Value Checks

- Correct target window (ignore detached DevTools windows)
- Renderer PID and main PID attribution
- IPC hot paths and repeated bridge calls
- Desktop-managed auth/bootstrap loops and failed retries
- Dev topology alignment (proxy target, port, bootstrap source)

## Preferred Instrumentation

- Renderer CPU profile through CDP
- macOS `sample` for process-level attribution
- `ps` snapshots over stable window

## Low-Risk Fix Order

1. Stabilize startup/topology mismatches
2. Eliminate retry loops and duplicate IPC emissions
3. Remove redundant renderer updates from identity churn
4. Re-check same desktop path with identical timings
