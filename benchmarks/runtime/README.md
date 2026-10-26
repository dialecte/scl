# SCL runtime performance tests

Repeatable wall-time measurements of the paths the S-IED implementation extension drives through
`@dialecte/core` + `@dialecte/scl`: import, query/read and transaction/write on a large SCL project.
Measurement only: **there are no timing thresholds**, a run never fails on speed.

## Run

```bash
npm run test:perf              # installed @dialecte/core
npm run test:perf:local-core   # locally built ../reference-core (see below)
npm run test:perf:profile      # adds CDP CPU self-time for the write scenarios (browser project only)
VITE_BENCH_TIMEOUT_MS=60000 npm run test:perf   # per-scenario cap, default 180000
```

Runs `src/**/*.bench.test.ts` in two vitest projects with `VITE_BENCH=1`. The normal `npm test` (`unit`
project) excludes them. A full run takes about 3.5 minutes.

| Project     | Runtime                   | Stores           | Sizes                |
| ----------- | ------------------------- | ---------------- | -------------------- |
| `perf`      | Chromium (real IndexedDB) | inMemory + local | small, medium, large |
| `perf-node` | Node                      | inMemory only    | large, xlarge        |

`local` is only run on small and medium: the IndexedDB import of `large` exceeds any sensible cap. A
scenario that exceeds the cap is reported as `CAPPED` and the rest of that run is skipped; it does not
fail the test (a slow run is a finding).

Read the `[PERF]` console lines; `[PERF-JSON]` carries the full per-scenario reports in one line.

### Measuring a local `@dialecte/core`

The bench measures the installed `@dialecte/core` by default, so it cannot verify a change made in
`reference-core` until it is pointed at it:

```bash
npm --prefix ../reference-core ci && npm --prefix ../reference-core run build-only   # once, and after every core edit
npm run test:perf:local-core
```

This aliases `@dialecte/core` (and `/test`, `/utils`, `/helpers`) to `../reference-core/dist`. Rebuild
first: measuring a stale build is worse than not measuring. Output is tagged `local core`; check that
`@dialecte/scl` still compiles against the core you are measuring.

## Fixture

`src/v2019C1/test/fixtures/generate-scl-workload.ts` builds a synthetic SCL project in memory (a stand-in
for a large lab system). It is separate from `generate-scl-stress-fixtures.ts` (disk files, flat CSWI
LNodes for `importTypes`) because the S-IED paths need IEDs with LDevices and LNs, a Substation of
LNodes pointing at them, and shared type closures, and because it has to run inside the browser project.
Size is driven by the IED count; each IED has 4 LDevices x 25 LNs, every LN has a matching `LNode`
(with `lnType`) in the Substation, and the `DataTypeTemplates` hold a shared type closure.

| Size   | Bytes    | Elements | IEDs  | LNs     | LNodes  | Runs in                  |
| ------ | -------- | -------- | ----- | ------- | ------- | ------------------------ |
| small  | 0.26 MB  | 4,259    | 20    | 2,000   | 2,000   | browser: inMemory, local |
| medium | 1.30 MB  | 21,169   | 100   | 10,000  | 10,000  | browser: inMemory, local |
| large  | 5.23 MB  | 84,519   | 400   | 40,000  | 40,000  | browser + node: inMemory |
| xlarge | 13.10 MB | 211,169  | 1,000 | 100,000 | 100,000 | node: inMemory           |

## Measurement

All timing uses core's dev perf helper (`project.perf`, enabled with `dev: { perf: true }`; see core's
`dev-perf` guide). Each scenario is a `bench::<name>` span via `perf.start` / `perf.stop`, on the same User
Timing timeline as the `core::` spans core instruments itself. `perf.reset()` runs between scenarios and
`perf.report()` is the only data source, so every scenario carries its own breakdown (for example
`core::store::bulkWrite`, `core::commit`). The console prints the three slowest non-bench spans per
scenario.

- **Cold vs warm.** Read scenarios run once cold (the first run after the import, with whatever the
  store has cached by then; this depends on scenario order) and then 5 more times. Tables show
  `cold / warm`, warm being the median of the repeats. Write scenarios mutate the document and run once.
- **Instrumentation guard.** Each scenario declares the spans it must produce (`EXPECTED_SPANS`). If
  core or scl stops instrumenting an op, or a scenario stops reaching it, the run fails. This is not a
  timing threshold.
- **CPU self-time.** `test:perf:profile` wraps the write scenarios in a CDP `Profiler` session and prints
  the top self-time functions. Wall time includes awaits; self-time does not. Core's dist is minified,
  so names are short.
- **Scenarios** are proxies for the S-IED paths: bulk `tx.update`, `tx.addChild`, and the scl
  `importTypes` take-over of type closures. The extension's own `applyMappingPlan` /
  `tx.mapping.applyPlan` lives in `s-ied-implementation` and is not covered here.

## Interpret

- `inMemory` isolates core + SCL cost; `local` adds IndexedDB (what the extension uses in production).
- Compare a scenario across sizes to see scaling. Flat = constant per-call cost; growing with the
  fixture = cost depends on document size.
- Compare runs only on the same machine. Single runs are noisy; look for large relative changes.

## Baseline

Measured 2026-10-26, macOS, Chromium headless via Playwright and Node, `@dialecte/scl` 0.10.0. All
values in ms; reads are `cold / warm`. `idb` = `local` store.

### `@dialecte/core` 0.6.4 (installed)

| Scenario                                | small mem |   small idb |  medium mem |  medium idb | large mem (browser) | large mem (node) | xlarge mem (node) |
| --------------------------------------- | --------: | ----------: | ----------: | ----------: | ------------------: | ---------------: | ----------------: |
| import                                  |      62.8 |       3,296 |         234 |      27,946 |                 913 |            1,034 |             2,664 |
| query: getRecordsByTagName(LNode)       | 0.4 / 0.1 | 19.6 / 16.0 |   1.0 / 0.5 |  119 / 62.6 |           4.9 / 4.2 |        9.2 / 6.7 |       22.4 / 19.3 |
| query: getAttributes per LNode          | 5.5 / 3.8 |   6.7 / 3.8 | 19.6 / 17.2 | 24.1 / 17.8 |         74.7 / 71.6 |      90.2 / 80.0 |         216 / 208 |
| query: getRecordsByTagName(IED) + attrs | 0.2 / 0.1 |   0.5 / 0.3 |   0.7 / 0.4 |   1.5 / 1.3 |           2.1 / 1.6 |        3.5 / 2.9 |         7.7 / 6.9 |
| query: findDescendants(first IED, LN)   | 1.2 / 0.5 | 28.0 / 22.7 |   3.4 / 2.1 |   136 / 108 |          11.4 / 9.8 |      20.0 / 19.6 |       60.6 / 60.2 |
| transaction: update x50 LNodes          |       296 |       4,569 |       1,828 |      22,009 |              10,940 |           22,165 |            90,772 |
| transaction: update x200 LNodes         |       852 |      12,531 |       5,473 |      62,945 |              33,325 |           65,267 |                 - |
| transaction: addChild x500 (LN)         |       108 |         356 |         418 |         320 |               1,913 |            3,232 |            15,449 |
| transaction: importTypes (1000 LNodes)  |      31.6 |         539 |         106 |       2,141 |                 587 |              964 |             5,158 |

### `@dialecte/core` 0.7.0 (local build of `reference-core`)

| Scenario                                | small mem |   small idb |  medium mem |  medium idb | large mem (browser) | large mem (node) | xlarge mem (node) |
| --------------------------------------- | --------: | ----------: | ----------: | ----------: | ------------------: | ---------------: | ----------------: |
| import                                  |      40.2 |         518 |         132 |       7,899 |                 512 |              550 |             1,229 |
| query: getRecordsByTagName(LNode)       | 0.4 / 0.1 | 21.6 / 12.4 |   1.0 / 0.5 | 97.4 / 57.7 |           3.8 / 2.4 |        8.6 / 6.4 |         9.5 / 9.2 |
| query: getAttributes per LNode          | 5.5 / 3.6 |   6.5 / 3.7 | 17.7 / 16.1 | 21.1 / 16.5 |         71.6 / 68.1 |      95.9 / 70.1 |         204 / 191 |
| query: getRecordsByTagName(IED) + attrs | 0.2 / 0.0 |   0.5 / 0.3 |   0.4 / 0.3 |   1.8 / 1.1 |           1.5 / 1.2 |        2.5 / 1.5 |         4.0 / 3.5 |
| query: findDescendants(first IED, LN)   | 1.2 / 0.6 | 24.2 / 19.9 |   2.7 / 1.9 |   110 / 103 |          11.2 / 8.4 |      16.3 / 16.2 |       45.9 / 47.8 |
| transaction: update x50 LNodes          |      37.2 |         251 |         158 |         288 |                 666 |              885 |             2,366 |
| transaction: update x200 LNodes         |       113 |         723 |         473 |         862 |               1,912 |            2,806 |                 - |
| transaction: addChild x500 (LN)         |      52.0 |         334 |         196 |         525 |                 740 |            1,285 |             2,915 |
| transaction: importTypes (1000 LNodes)  |      16.3 |         404 |        52.3 |       1,426 |                 215 |              416 |             1,327 |

### Findings

- **`tx.update` was the bottleneck on core 0.6.4 and is fixed on 0.7.0.** 50 updates took 10.9 s on 40K
  LNodes (~220 ms each, growing with document size); on 0.7.0 they take 0.67 s. The 0.6.4 profile
  shows the time in per-update lookups (`getByTagNameInDocument`), not in the commit (`core::commit`
  ~0 ms).
- **IndexedDB** was 1-2 orders of magnitude slower than in-memory on 0.6.4 for import and `tx.update`;
  on 0.7.0 `tx.update` is close to in-memory, and import is ~3.5x faster (27.9 s -> 7.9 s on medium).
- **Node is slower than Chromium** for writes on 0.6.4 (22 s vs 11 s for `update x50` on large).
- Reads are cheap everywhere and change little between core versions.
- `addChild` and `importTypes` scale roughly linearly up to `large`; at `xlarge` on 0.6.4 they grow
  faster than the fixture (`addChild x500` 1.9 s -> 15 s for 2.5x the size).
- **Import failed at 160K LNodes** (1,600 IEDs, ~21 MB) on 0.6.4 with `RangeError: Maximum call stack size
exceeded` in `src/v2019C1/hooks/io/io-hooks.ts` (`updates.push(...specNaming.updates)` spreads an
  array past the engine's argument limit). `xlarge` is therefore kept at 100K LNodes. Not retried on 0.7.0.
- These are single runs: treat differences under ~30% as noise.

## Related

- `src/v2019C1/test/fixtures/run-scl-benchmarks.ts`: node script benchmarking `importTypes` on disk fixtures.
- Type-level benchmarks: [`../types/CONCLUSION.md`](../types/CONCLUSION.md).
