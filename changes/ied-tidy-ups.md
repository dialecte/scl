### Added

- The type `ResolveTuplesParams`, what `query.reference.resolveTuples` takes (`{ references: readonly TupleToResolve[] }`), exported beside `TupleToResolve`.

### Fixed

- The test helpers' checks that a fixture root states its SCL version and, carrying the eIEC61850-6-100 namespace, the extension's version read the root element as XML: a comment before the root, a `>` inside an attribute value, a prefixed root or single quotes no longer give a wrong verdict.
