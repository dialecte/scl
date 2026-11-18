### Added

- `reference.query.readSpecNamings(query, { lnodes })` reads the `LNodeSpecNaming` of many LNodes at once, one entry per LNode in input order (`undefined` for a ref naming nothing), in at most 2 store reads (records), at most 3 with refs, whatever their number: matching many LNodes against their specification no longer reads each naming on its own.
