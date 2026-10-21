# Real-file corpus

The `corpus` vitest project imports, validates and exports every SCL file of the expert's test system (FSDs, ASDs, SSD
templates and SSD system files). The files are engineering data that is **not published**: this folder is ignored by
git except this README, and a fresh clone has no corpus.

## Sync

```sh
npm run corpus:sync -- "<source folder>" [--xsd] [--xsd-from "<path to the xsd folder>"]
# or
SCL_CORPUS_SOURCE="<source folder>" SCL_XSD_SOURCE="<path to the xsd folder>" npm run corpus:sync
```

The source folder is the expert's "Test System V2" folder. The script reads every `.fsd`, `.asd`, `.ssd` and `.xml`
file whose root element is `SCL`, under its relative path; folders named `old` (any case) and the logic exports
(another root element) are left out. It groups the files by Header uuid, one family each (a file whose uuid no other
file has is its own family), drops a byte duplicate (keeping the dialect's own extension over an `.xml` copy, then the
shorter name), and copies:

- `smoke/`: the file the smoke runs, the latest revision (version, then revision) that is not excluded; a family whose
  every revision is excluded has none;
- `pairs/`: the other revisions of a family of several, untouched, an excluded one included, for fork tests;
- `MANIFEST.md`: one row per family (Header uuid, versions, smoke file, pairs, duplicates), then the excluded files.

`CORPUS_EXCLUDED` (`src/v2019C1/test/corpus/corpus.constants.ts`) lists the files of the source left out, one reason
each: the schema refuses them, their references name nothing, or their content is wrong where no check looks. They are
never copied but as a pair; the sync prints how many, grouped by reason, and an excluded path the source no longer
holds. It also lists the smoke files that are not in `CORPUS_FILES` and those missing. With `--xsd` it syncs the
schema files from the create package too (as `npm run xsd:sync`; `--xsd-from` names another folder), which the smoke
needs: without them the corpus project skips.

## Run

```sh
npm run test:corpus
```

With an empty folder, or without the schema files, the project skips (the vitest config logs one line). Each file gets
two cases, and every smoke file must pass both (the pairs are read by fork tests only). **The file**: valid by
structure, by the XSD validator and for coherent references. **Import and export**: it imports with the warnings it is
known to give (`CORPUS_EXPECTED_WARNINGS`), the imported document holds nothing a real file could not, its export is a
fixed point and keeps every uuid and element of the file.

## The excluded files, again

```sh
npm run corpus:check-excluded -- "<source folder>"
# or: npm run corpus:sync -- --check-excluded "<source folder>"
```

Copies nothing: the `corpus-excluded` vitest project (only defined for this run) reads each excluded file in the
source folder and runs the same two checks on it; the script then lists the files that now pass, to find the ones the
expert saved again, and apart those the source no longer holds and those not checked (no schema files). A file whose
defect no check sees passes every time: keep it excluded.
