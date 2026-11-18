### Added

- `reference.query.readSpecNamings(query, { lnodes })` reads the `LNodeSpecNaming` of many LNodes at once, one entry per LNode in input order (`undefined` for a ref naming nothing), in 2 store reads when the LNodes are given as records, 3 when refs are among them, whatever their number: matching many LNodes against their specification no longer reads each naming on its own.
