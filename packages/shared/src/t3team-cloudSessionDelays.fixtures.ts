// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionDelays = [
  '{"attempt":0,"ms":1000}',
  '{"attempt":1,"ms":1600}',
  '{"attempt":2,"ms":2560}',
  '{"attempt":3,"ms":4096}',
  '{"attempt":4,"ms":6554}',
  '{"attempt":5,"ms":8000}',
  '{"attempt":6,"ms":8000}',
  '{"attempt":7,"ms":8000}',
  '{"attempt":8,"ms":8000}',
  '{"attempt":9,"ms":8000}',
  '{"attempt":10,"ms":8000}',
  '{"attempt":11,"ms":8000}',
  '{"attempt":12,"ms":8000}',
  '{"attempt":13,"ms":8000}',
] as const;
