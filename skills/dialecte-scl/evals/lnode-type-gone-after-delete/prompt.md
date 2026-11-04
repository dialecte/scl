---
tags: [dialecte]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

Quick question about @dialecte/scl (source checked out in <scl-root>, read only), answer in ./out/ANSWER.md in a few paragraphs: in our app, after a user deletes the last LNode that used `lnType="XCBR_vendor"` and the transaction commits, the LNodeType XCBR_vendor and some DOTypes are gone from the document. Is that a bug? Why does it happen, and what should our app do when the user later wants to put a new LNode with that type back?
