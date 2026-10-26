---
tags: [dialecte]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash]
---

Dialecte repos are in <dialecte-root> (read only, change nothing). In our SCL app I have two dialecte documents opened from the same project: an ICD file and the SCD project file. I need a function `importIedIntoScd` that copies the IED from the ICD into the SCD, including the data type templates it uses, keeping vendor Private content, without uuid clashes. Write the implementation (and a test outline) in ./out/ with a README.md on the approach.
