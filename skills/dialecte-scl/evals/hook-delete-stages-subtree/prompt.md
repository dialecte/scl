---
tags: [dialecte]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

The @dialecte/scl repo is checked out in <scl-root> (read only, change nothing). We want a new rule inside scl: when a transaction updates a FunctionRef so that its `functionUuid` is empty (it points at no function any more), the FunctionRef is removed by the afterUpdated hook in the same transaction. Write the step for `src/v2019C1/hooks/after-updated/` (a function returning the `Scl.Operation[]` the hook stages, wired into `afterUpdated`) and its test. Put your files and a short README.md on the approach in ./out/.
