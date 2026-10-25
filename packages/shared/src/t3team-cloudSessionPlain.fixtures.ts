// Golden vectors captured from the pre-move implementation (apps/server/src/cloud at b13ec83614).
// Each row is one JSON-encoded case (or a plain string). Do not hand-edit: they pin byte-identical
// behaviour across the move to @t3tools/shared.

export const cloudSessionPlain = [
  '{"project":null,"undefinedProject":false,"inputs":{}}',
  '{"project":null,"undefinedProject":true,"inputs":{}}',
  '{"project":{"kind":"checkout","checkout":{"repository":{"url":"https://h/o/n.git","host":"h","owner":"o","name":"n"},"commit":"abc123","token":"T","author":{"name":"N","email":"E"}}},"undefinedProject":false,"inputs":{"project_repository":"https://h/o/n.git","project_commit":"abc123"}}',
  '{"project":{"kind":"workspace","folder":"my-project-1234","title":"My Project"},"undefinedProject":false,"inputs":{"project_name":"my-project-1234"}}',
  '{"project":{"kind":"workspace","folder":"","title":""},"undefinedProject":false,"inputs":{"project_name":""}}',
] as const;
