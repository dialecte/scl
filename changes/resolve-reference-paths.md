### Added

- `reference.query.resolveReferencePaths(query, { records, pathAttribute })` resolves the reference path of many records at once, one answer per record in input order (`undefined` where `resolveReferencePath` answers it), each exactly as `resolveReferencePath` resolves it: the reads of all the records are merged, one attribute lookup per target tag and attribute with every value asked, ancestors one read per level, the signals searched one candidate per record at a time, each round in one `buildElementPaths`, each signal tag read once (13 behavior variables naming signals by path: 31 store reads, was 837 one by one). When a read is refused, every record still runs to its end, then the call throws the first error in input order.

### Changed

- `reference.query.resolveReferencePath` is `resolveReferencePaths` of one record: the same answers; never more store reads or records than before, fewer where a resolve read the same element twice, and far fewer when it searches a signal by its path (its tag read once, a path built only for a signal the path can name).
