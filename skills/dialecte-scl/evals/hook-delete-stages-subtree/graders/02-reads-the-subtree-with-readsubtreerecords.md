---
type: llm
focus: trace
weight: 1
---

The step reads the FunctionRef's subtree with scl's `readSubtreeRecords` (directly or through an scl helper that calls it), not with `findDescendants` nor a loop of per-record queries
