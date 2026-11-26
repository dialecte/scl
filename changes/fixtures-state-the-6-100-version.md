### Changed

- **Breaking (test helpers, `@dialecte/scl/v2019C1/test`):** `ALL_XMLNS_NAMESPACES` now also states the eIEC61850-6-100 version paired with the current SCL edition, `eIEC61850-6-100:version="2019" eIEC61850-6-100:revision="C" eIEC61850-6-100:release="1"`: a fixture root that writes these attributes beside it now holds them twice and fails to import; drop them from the root.
- **Breaking (test helpers):** a given document carrying the eIEC61850-6-100 namespace (declared on its root or below it) whose `SCL` root states not the extension's version is refused by `runSclTestCases`, `createSclTestProject` and `openSclDocument`, naming the case and the document, unless the case or the call sets `noExtensionVersion` with the reason; a `noExtensionVersion` without a reason, or on documents that all state the version, is refused too.

### Added

- `noExtensionVersion` on a test case, on `createSclTestProject` and on `openSclDocument`: the reason a given document carries the eIEC61850-6-100 namespace without the extension's version on its root.
- `CURRENT_SCL_EDITION` and `CURRENT_6_100_VERSION` exported from the test helpers: the root attributes `ALL_XMLNS_NAMESPACES` states, to build a root from the namespace constants.
