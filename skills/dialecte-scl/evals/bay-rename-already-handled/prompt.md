---
tags: [dialecte]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

The Dialecte repos are checked out in <dialecte-root> (core, scl, ...). Do not modify anything there. In our app, when a user renames a Bay in an SCL document through dialecte, the FunctionRef / LNode / other references that point to that bay by path must follow the new name. Write the TypeScript function we should call after `tx.update(bay, { attributes: { name } })` to fix all those referencing paths, with its tests. Put your files and a short README.md explaining your approach in ./out/.
