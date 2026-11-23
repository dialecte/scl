### Added

- `buildIed` writes the values the logical nodes specify (DOS/SDS/DAS with a value) as DOI/SDI/DAI of the built logical nodes; values whose data the type does not hold, or of an excluded functional constraint (`excludeFunctionalConstraints`), are listed in the plan's `valuesLeftOut`; a value already on the logical node is not written again.
- `buildIed` / `planIed` option `ldNameAlsoFits`: other IED names each logical device name must fit too (the length check uses the longest of the IED's name and these), for an IED renamed after the build.
