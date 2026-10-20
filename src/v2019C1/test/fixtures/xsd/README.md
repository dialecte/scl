# SCL schema files

The output check of the test helpers validates the documents a test leaves against these schema files, with an XSD
validator (libxml2-wasm) run in the test's browser. `use-fixture-schemas.setup.ts` points the check at this folder for
the tests of this package.

## Sync

The files are **not committed** (this folder ignores them, its README and setup file aside). Copy them from the
sibling create package, `create/xsd/SCL` beside the scl checkout (from a worktree: beside its main checkout, found
through git's common directory), where they are uncommitted too; each is checked against the sha256 below, and nothing
is copied when one differs or is missing (the error names the folder tried):

```sh
npm run xsd:sync
# or from another folder
npm run xsd:sync -- --from "<path to the xsd folder>"
SCL_XSD_SOURCE="<path to the xsd folder>" npm run xsd:sync
```

Without them (a fresh clone, the CI) the XSD validator does not run: the output check runs its other checks, the
vitest config prints one line per run saying so, and a failure says it was checked without the validator.

## Source and licence

The 9 files are the IEC schema files, unchanged: the SCL schema of the 2007 C5 edition (`SCL.xsd` and its parts) and
the 6-100 schema (`IEC61850-6-100.xsd`, which imports `SCL.xsd`), the same files as the create package's
`xsd/SCL` folder and the SDK-v2 `xsd` folder of the project's documentation set (byte for byte). Each file carries the IEC copyright notice; their use is governed by the IEC licence for code
components (see www.iec.ch/CCv1). They are neither committed nor shipped with the npm package (the test entry reads
them at run time, never inlines them). A package using the test helpers gives its own copy to `configureSclXsdSchemas`.

| File                        | sha256                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `IEC61850-6-100.xsd`        | `d0d70960a3394c11cd93961ed326b6d7c447d5abf946f5f0e20411c0943710dc` |
| `SCL.xsd`                   | `cc5d0b582078f711a7ecd04c624301e496a6ffa059e37358e38f14a6eea0f11e` |
| `SCL_BaseSimpleTypes.xsd`   | `e702e2554a751c9e77c0d637f9e757dea7f9a72f7722ef62fd03c6165e59db49` |
| `SCL_BaseTypes.xsd`         | `05ad287c45b4f685a419b26e06eaaa58bc4a82a866d4cd0f361bb864834725b0` |
| `SCL_Communication.xsd`     | `e34f1b5b548d2f70ec71b7731831ac8a2de521638752ef73d68187c441154227` |
| `SCL_DataTypeTemplates.xsd` | `aa1c83df80d28bb949ed86c403a3695232e51f475110418974a5406add1a1855` |
| `SCL_Enums.xsd`             | `fac4526f82eb8eb7dd8d7b307022a6148835b2a55fa5c285f9cb091001a63c4f` |
| `SCL_IED.xsd`               | `ff51b87cad5b910fc775fd0cc0541fb36ba2e67ae29f8990daafc4dcdba523a4` |
| `SCL_Substation.xsd`        | `d5c97d2601303306cf15c4fb60885aae34fc532cef687504a95644964c5bfd7a` |
