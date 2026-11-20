### Changed

- **Naming many signals of one parent counts the parent's signals once.** The signals (`SourceRef`, `ControlRef`) of one parent now share one frozen sibling list per call, so their names (`Trip` or `Trip(1)`) are worked out from one count of the parent's signals instead of one count per signal. `info.of` / `info.ofEach`, `info.search` and the element paths of signals answer as before, faster on a parent with many signals; the store reads are unchanged.
