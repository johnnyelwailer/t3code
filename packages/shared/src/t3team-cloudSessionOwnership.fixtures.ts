// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionOwnership = [
  '{"kind":"run","run":{"id":1,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"a [t.s1]","actor":"pj"}}',
  '{"kind":"run","run":{"id":2,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"b","actor":"PJ"}}',
  '{"kind":"run","run":{"id":3,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"c · standby x","actor":"pj"}}',
  '{"kind":"run","run":{"id":4,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"d · standby","actor":"pj"}}',
  '{"kind":"run","run":{"id":5,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"e","actor":""}}',
  '{"kind":"run","run":{"id":6,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"f","actor":" pj"}}',
  '{"kind":"run","run":{"id":7,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"g · standby ","actor":"pj"}}',
  '{"kind":"run","run":{"id":8,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"h","actor":"pj​"}}',
  '{"kind":"run","run":{"id":9,"status":"queued","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"i","actor":"pj"}}',
  '{"kind":"byLogin","login":"pj","ids":[1,4,9]}',
  '{"kind":"byLogin","login":"PJ","ids":[2]}',
  '{"kind":"byLogin","login":"Pj","ids":[]}',
  '{"kind":"byLogin","login":"","ids":[5]}',
  '{"kind":"byLogin","login":"pj ","ids":[]}',
  '{"kind":"byLogin","login":"ünï","ids":[]}',
  '{"kind":"actor","value":null,"login":""}',
  '{"kind":"actor","value":"__undefined__","login":""}',
  '{"kind":"actor","value":"x","login":""}',
  '{"kind":"actor","value":5,"login":""}',
  '{"kind":"actor","value":{},"login":""}',
  '{"kind":"actor","value":{"login":5},"login":""}',
  '{"kind":"actor","value":{"login":"pj"},"login":"pj"}',
  '{"kind":"actor","value":{"login":""},"login":""}',
  '{"kind":"actor","value":[],"login":""}',
  '{"kind":"actor","value":{"Login":"pj"},"login":""}',
] as const;
