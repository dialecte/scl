### Fixed

- An IED built from a template ISD takes only its shell: `tx.specification.stageIsd` no longer copies the template IED's description, its logical devices (its LD0, supervision and function logical devices) and their logical nodes, data sets and control blocks; every logical device is built from the LNodes. What the template held is listed in `result.shellLeftOut`.

### Added

- `tx.specification.copyIedShell`: copy a template IED as the shell of an IED built from a specification (its services and access points, no logical device, no description, no checkout, the types of its LN0 and LPHD), with what was left out and those types as `shellTypes`.
- `buildIed` and `planIed` take `shellTypes`: LNodeTypes the IED's shell offers as its own, counted as types the IED uses for the `lnType` rule (`sameClassInTargetIed`).
