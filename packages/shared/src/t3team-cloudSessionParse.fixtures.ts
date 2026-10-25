// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionParse = [
  '{"body":"","runs":null,"login":null,"steps":null}',
  '{"body":"null","runs":null,"login":null,"steps":null}',
  '{"body":"[]","runs":null,"login":null,"steps":null}',
  '{"body":"{}","runs":null,"login":null,"steps":null}',
  '{"body":"not json","runs":null,"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":[]}","runs":[],"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":null}","runs":null,"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":[{}]}","runs":[{"id":0,"status":"","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"","actor":""}],"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":[{\\"id\\":5,\\"status\\":\\"completed\\",\\"conclusion\\":\\"success\\",\\"created_at\\":\\"c\\",\\"updated_at\\":\\"u\\",\\"html_url\\":\\"h\\",\\"name\\":\\"n\\",\\"display_title\\":\\"d\\",\\"actor\\":{\\"login\\":\\"Pj\\"},\\"run_attempt\\":2}]}","runs":[{"id":5,"status":"completed","conclusion":"success","createdAt":"c","updatedAt":"u","htmlUrl":"h","name":"n","actor":"Pj","runAttempt":2}],"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":[{\\"id\\":\\"5\\",\\"name\\":\\"\\",\\"display_title\\":\\"d\\",\\"actor\\":null}]}","runs":[{"id":0,"status":"","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"d","actor":""}],"login":null,"steps":null}',
  '{"body":"{\\"workflow_runs\\":[1,null,\\"x\\",{\\"id\\":1}]}","runs":[{"id":1,"status":"","conclusion":null,"createdAt":"","updatedAt":"","htmlUrl":"","name":"","actor":""}],"login":null,"steps":null}',
  '{"body":"{\\"login\\":\\"pj\\"}","runs":null,"login":"pj","steps":null}',
  '{"body":"{\\"login\\":\\"\\"}","runs":null,"login":null,"steps":null}',
  '{"body":"{\\"login\\":5}","runs":null,"login":null,"steps":null}',
  '{"body":"{\\"jobs\\":[]}","runs":null,"login":null,"steps":[]}',
  '{"body":"{\\"jobs\\":null}","runs":null,"login":null,"steps":null}',
  '{"body":"{\\"jobs\\":[{\\"steps\\":[{\\"name\\":\\"a\\",\\"status\\":\\"completed\\",\\"conclusion\\":\\"success\\",\\"started_at\\":\\"t\\"},{\\"name\\":\\"b\\",\\"status\\":\\"queued\\",\\"conclusion\\":null}]}]}","runs":null,"login":null,"steps":[{"name":"a","status":"completed","conclusion":"success","startedAt":"t"},{"name":"b","status":"queued","conclusion":null}]}',
  '{"body":"{\\"jobs\\":[{\\"steps\\":[{\\"name\\":5}]}]}","runs":null,"login":null,"steps":[{"name":"","status":"","conclusion":null}]}',
  '{"body":"{\\"jobs\\":[{\\"run_attempt\\":1,\\"steps\\":[]},{\\"steps\\":[{\\"name\\":\\"z\\",\\"status\\":\\"x\\"}]}]}","runs":null,"login":null,"steps":[{"name":"z","status":"x","conclusion":null}]}',
] as const;
