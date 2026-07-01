export function renderChangeRequestAssessmentTemplate(): string {
  return `# CR-NNNN — <change request title>

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| Status         | Assessed                                      |
| Assessor (RE)  | <name>                                        |
| Source         | <customer / ticket / email link>              |
| Created        | YYYY-MM-DD                                     |
| Complexity     | Trivial \\| Low \\| Medium \\| High \\| Very High |
| Story-spec     | <low>-<high> SP (<low>-<high> h)              |
| Developer      | <low>-<high> SP (<low>-<high> h)              |
| Confidence     | High \\| Medium \\| Low                        |
| Recommendation | proceed \\| split \\| clarify \\| reject        |

## 1. Change request

**Core change (one sentence):** ...

> Verbatim CR text or link to source.

## 2. Requirements

**Explicit**

1. ...

**Implicit**

1. ...

**Ambiguities / open questions**

- [ ] (blocking) ...
- [ ] (non-blocking) ...

## 3. Affected components

| Component | New / Modify | What changes | Req # | Risk |
| --- | --- | --- | --- | --- |
| <package/module> | Modify | ... | 1 | ... |
| <shared contract/schema> | Modify | ... | 2 | high |

High-cost signals present: shared contract change [ ] · cross-package [ ] · data migration [ ] · reconnect/streaming/state [ ] · structural split pressure [ ]

## 4. Complexity

**Band:** ...
**Drivers:** ...

## 5. Effort estimate

_Story points (1 SP = 8 h)._

| Effort | Range | Drivers / assumptions |
| --- | --- | --- |
| Story-spec (RE/PO) | ...-... SP (...-... h) | ... |
| Developer (impl+tests+review) | ...-... SP (...-... h) | ... |

**Confidence:** ... — because ...

## 6. Risks, dependencies, recommendation

- **Risks & unknowns:** ...
- **Dependencies:** ...
- **Recommendation:** ... — because ...
`;
}
