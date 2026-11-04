---
type: llm
focus: trace
weight: 1
---

The output states that after the first commit the removed LNode's type (its LNodeType, with the types only it named) is gone when that LNode was the last element naming it, so an LNode created in a later transaction with that `lnType` names a missing type
