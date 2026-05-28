# Server Scope Reference

Use for backend throughput/latency/CPU regressions tied to user-visible flows.

## Typical Symptoms

- Slow API responses under light load
- Elevated CPU from repeated polling/work duplication
- Request fan-out or expensive recomputation
- Event-loop pressure from avoidable synchronous paths

## High-Value Checks

- Endpoint-level timing and request frequency
- Duplicate work across repeated identical inputs
- Serialization/deserialization hot spots
- Unbounded retries/backoff issues
- Overly broad invalidation/cache misses

## Preferred Instrumentation

- Endpoint timing snapshots for target scenario
- CPU sample/profile on process during repro window
- Request trace comparison before/after targeted fix

## Low-Risk Fix Order

1. Remove duplicate work on identical inputs
2. Add cheap memo/cache guards where safe
3. Narrow polling/refresh triggers
4. Defer architectural changes unless measured need persists
