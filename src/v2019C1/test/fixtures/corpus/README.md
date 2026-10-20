# Real-file corpus

The `corpus` vitest project imports, validates and exports every SCL file of the Test System V2 corpus (expert files:
FSDs, ASDs, SSD templates and SSD system files). The files are engineering data that is **not published**: this
folder is ignored by git except this README, and a fresh clone has no corpus.

## Sync

```sh
npm run corpus:sync -- "<path to Test System V2>" [--xsd] [--xsd-from "<path to the xsd folder>"]
# or
SCL_CORPUS_V2_SOURCE="<path to Test System V2>" SCL_XSD_SOURCE="<path to the xsd folder>" npm run corpus:sync
```

The script reads every `.fsd`, `.asd`, `.ssd` and `.xml` file whose root element is `SCL`, under its relative path;
folders named `old` (any case) and the logic exports (another root element) are left out. It groups the files by
Header uuid, one family each (a file whose uuid no other file has is its own family), drops a byte duplicate (keeping
the dialect's own extension over an `.xml` copy, then the shorter name), and copies:

- `v2/`: the file the smoke runs, the latest revision (version, then revision) that is not quarantined, or the latest
  when every revision is;
- `pairs/`: the other revisions, untouched, for fork tests;
- `MANIFEST.md`: one row per family, its files, Header uuid, versions, smoke file, pairs, duplicates and quarantine.

It lists the smoke files that are not in `CORPUS_V2_FILES` (`src/v2019C1/test/corpus/corpus-v2.constants.ts`) and
those missing. With `--xsd` it also syncs the schema files from the create package (as `npm run xsd:sync`; `--xsd-from` names
another folder), which the smoke needs: without them
the corpus project skips.

## Run

```sh
npm run test:corpus
```

With an empty folder, or without the schema files, the project skips (the vitest config logs one line). Each file gets two cases. **The file**: valid by structure,
by the XSD validator and for coherent references. **Import and export**: it imports with the warnings it is known to
give (`CORPUS_V2_EXPECTED_WARNINGS`), the imported document holds nothing a real file could not, its export is a fixed
point and keeps every uuid and element of the file. `CORPUS_V2_QUARANTINE` lists the files that are not truth (the
schema refuses them, their references name nothing, or their content is wrong where no check looks): with
`fileCheck: 'fails'` the check of the file runs as an expected failure, so a file that starts passing fails the run and
leaves the list; their import and export are checked, the imported document aside. `CORPUS_V2_ENGINE_DEFECTS` lists
the files a known engine defect fails, and which of the two checks run as expected failures.
