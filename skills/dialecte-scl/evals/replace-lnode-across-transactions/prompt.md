---
tags: [dialecte]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

Our SCL editor app uses @dialecte/scl; its source is checked out in <scl-root> for reference (read only, change nothing there). In the "replace logical node" dialog the user first removes an LNode from a Bay and only later, after a second dialog, picks the replacement: we run `tx.delete(oldLNode)` and commit in one transaction, then in a second transaction `tx.create` a new LNode under the same Bay with the same `lnClass`, `lnInst` and `lnType` as the removed one, and commit. Write `removeLogicalNode(doc, { lnode })` and `addReplacementLogicalNode(doc, { bay, attributes })` for this flow in ./out/replace-logical-node.ts, with a short README.md on anything the flow must take care of.
