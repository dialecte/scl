### Added

- A copy (`scenario: 'copy'`, `verb: 'asd'`) of an application whose functions sit on several levels of the topology lands instead of being refused. The report lists one `kind: 'level'` mapping per source level, top-down. Each lands that level's functions under the element of the same tag and name directly under where the row above lands (the anchor for the top one), else on that place itself; the place itself is the row's first candidate. The application lands under the anchor. `resolution.mappings`, keyed by the source level, moves a row to another element at or below the anchor, and `apply` writes what the report says. A variable or behaviour held by a source level lands where that level lands, and its reach is judged there. A name taken is judged where each function lands, apart from what the copy placed there before it.
- `query.lifecycle.report` and `tx.lifecycle.apply` refuse a copy's choice that creates a level (`OPTION_NOT_AVAILABLE`, `meta: { option: 'decisionMappings', value: 'create' }`), names an element the document lacks or one outside the anchor (`MAPPING_CHOICE_NOT_A_CANDIDATE`), or names one that cannot hold a function (`INVALID_PARENT_CHILD`).

### Changed

- A copy of an application whose functions sit under several parents is no longer refused with `OPTION_NOT_AVAILABLE` (`reason: 'functions-under-several-parents'`): it lands by its level rows.
