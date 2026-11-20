---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

In a project document I call `tx.any.move` to move the logical node PTRC1 (it has a uuid) from LDevice PROT to LDevice CTRL of the same IED BCU1. Another IED, SUB1, has an ExtRef subscribing to PTRC1 with `lnUuid` set, and a Function in the bay has an LNode bound to PTRC1. Will the transaction commit with @dialecte/scl, and what do the ExtRef and the LNode look like afterwards? Answer in answer.md.
