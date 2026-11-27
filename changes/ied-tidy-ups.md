### Added

- The type `ResolveTuplesParams`, what `query.reference.resolveTuples` takes (`{ references: readonly TupleToResolve[] }`), exported beside `TupleToResolve`.

### Changed

- The test helpers (`runSclTestCases`, `createSclTestProject`, `openSclDocument`) refuse a given document whose `SCL` root states its version without its `revision` and `release`, whatever the case sets; `editionOneRoot` still opts in a root stating no version.
- `sax` (`^1.4.3`, the parser `@dialecte/core` already depends on) is a direct dependency: the test helpers read a fixture's root with it.

### Fixed

- The test helpers' checks that a fixture root states its SCL version and, carrying the eIEC61850-6-100 namespace, the extension's version read the root element with an XML parser: a comment before the root, a `>` inside an attribute value, a prefixed root or single quotes no longer give a wrong verdict.
