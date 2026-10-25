// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionPoolKey = [
  '{"owner":"acme","name":"api","key":"acme.api"}',
  '{"owner":"Acme","name":"API","key":"acme.api"}',
  '{"owner":"a b","name":"c/d","key":"a.b.c.d"}',
  '{"owner":"ünï","name":"x","key":".n..x"}',
  '{"owner":"a","name":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","key":"a.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  '{"owner":"a_b","name":"c.d-e","key":"a_b.c.d-e"}',
] as const;
