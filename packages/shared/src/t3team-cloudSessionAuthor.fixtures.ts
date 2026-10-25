// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionAuthor = [
  '{"profile":{"login":"pj","id":1,"name":"PJ","email":"pj@x.ch"},"host":"h.com","author":{"name":"PJ","email":"pj@x.ch"}}',
  '{"profile":{"login":"pj","id":7,"name":"  ","email":" "},"host":"h.com","author":{"name":"pj","email":"7+pj@users.noreply.h.com"}}',
  '{"profile":{"login":"pj","id":7,"name":null,"email":null},"host":"nexplore.ghe.com","author":{"name":"pj","email":"7+pj@users.noreply.nexplore.ghe.com"}}',
  '{"profile":{"login":"pj","id":7},"host":"h","author":{"name":"pj","email":"7+pj@users.noreply.h"}}',
  '{"profile":{"login":"pj","id":0,"name":"  Padded Name ","email":" a@b.c "},"host":"h","author":{"name":"Padded Name","email":"a@b.c"}}',
  '{"profile":{"login":"ünï","id":9,"name":"","email":""},"host":"ghe","author":{"name":"ünï","email":"9+ünï@users.noreply.ghe"}}',
] as const;
