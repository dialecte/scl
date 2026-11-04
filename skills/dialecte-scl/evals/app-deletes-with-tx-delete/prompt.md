---
tags: [dialecte]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

Our SCL editor app is in <app-root> and uses @dialecte/scl from npm (installed under node_modules, read only). When the user removes a terminal from a conducting equipment we delete the Terminal, and I want to be sure its Text, its vendor Private and everything else under it leave the store too, not only the export. Write a helper `removeTerminal(tx, { terminal })` for the app in ./out/removeTerminal.ts, with a short README.md on why it is enough and how you would test it.
