---
tags: [dialecte]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

The @dialecte/scl repo is checked out in <scl-root> (read only, change nothing). Quick question before I write code, answer in a short ANSWER.md in ./out/ (a few paragraphs, no implementation): I'm adding an afterUpdated step in scl that removes a Terminal when its `cNodeUuid` is emptied. My plan is to return two operations: `{ status: 'deleted', oldRecord: terminal, newRecord: undefined }` and an `updated` operation of its parent that drops it from `children`. Is that enough? What happens at commit with that plan, and what should the step stage instead?
