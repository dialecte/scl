### Changed

- **Breaking (test helpers, `@dialecte/scl/v2019C1/test`):** `ALL_XMLNS_NAMESPACES` now also states the SCL edition of the current files, `version="2007" revision="C" release="5"`: a fixture root that writes these attributes beside it now holds them twice and fails to import; drop them from the root.
- **Breaking (test helpers):** a given document whose `SCL` root states no version (a first-edition file) is refused by `runSclTestCases`, `createSclTestProject` and `openSclDocument`, naming the case and the document, unless the case or the call sets `editionOneRoot` with the reason it is a first-edition file on purpose; an `editionOneRoot` without a reason, or on documents that all state their version, is refused too.

### Added

- `editionOneRoot` on a test case, on `createSclTestProject` and on `openSclDocument`: the reason a given document is a first-edition file, its root stating no SCL version.
