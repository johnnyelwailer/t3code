// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionRunName = [
  '{"runName":"nexi-session [api.s1x2] · broker · machine","name":"api"}',
  '{"runName":"nexi-session · broker","name":null}',
  '{"runName":"hive/nx-nexi [main] [api.s1x2] · broker","name":"api"}',
  '{"runName":"hive/nx-nexi [main] [s1x2]","name":null}',
  '{"runName":"","name":null}',
  '{"runName":"[a.s1]","name":"a"}',
  '{"runName":"[a.s1] [b.s2]","name":"a"}',
  '{"runName":"[.s1]","name":null}',
  '{"runName":"[a.b.s1]","name":null}',
  '{"runName":"[a..s1]","name":null}',
  '{"runName":"[a.S1]","name":null}',
  '{"runName":"[a.s1X]","name":null}',
  '{"runName":"[a b.s1]","name":null}',
  '{"runName":"[ünï.s1]","name":null}',
  '{"runName":"[a-b_c.s9z]","name":"a-b_c"}',
  '{"runName":"[a.s]","name":null}',
  '{"runName":"x[a.s1]y","name":"a"}',
  '{"runName":"[a.s1","name":null}',
  '{"runName":"a.s1]","name":null}',
  '{"runName":"[a.s1]]","name":"a"}',
  '{"runName":"[[a.s1]]","name":"a"}',
  '{"runName":"[A.s0]","name":"A"}',
  '{"runName":"[web-app-v2.s2h5k9x0] · machine","name":"web-app-v2"}',
  '{"runName":"[xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.sabc]","name":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
  '{"runName":"[a.sé]","name":null}',
  '{"runName":"[a.s1\\n]","name":null}',
  '{"runName":"\\n[a.s1]","name":"a"}',
  '{"runName":"[tag.s1] · standby","name":"tag"}',
] as const;
