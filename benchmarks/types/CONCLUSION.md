# Iteration 1 — Type-performance & readability conclusion

Measured 2026-06 · TypeScript 6.0.3 · `tsc --extendedDiagnostics` (min of 3 runs, deterministic)
· build config (`skipLibCheck:false`). Harness: `scripts/type-bench.mjs`, `scripts/type-audit.mjs`.
Raw data: `baseline.json`, `readability-audit.md`.

**Coverage of this analysis (what's comprehensive vs. sampled):**

- **Instantiation totals & trace** — comprehensive: `tsc` compiled all 309 scl / 380 core source
  files; analyze-trace ranks _every_ file (complete hot-spot list below, threshold 100ms).
- **Readability audit** — comprehensive: **186 members** — every method of
  `Scl.Query`/`Scl.Transaction`/`Scl.Document`/**`Scl.Project`** (incl. extension groups and the
  `.any` escape hatch) **and all 41 `Scl` namespace type aliases**, discovered dynamically and
  rendered both concrete (`'LNode'`) and wide (`ElementsOf`). See `readability-audit.md`.
- **Narrowing net** (`narrowing.test-d.ts`) — asserts the invariants that must survive Iteration 2/3:
  concrete element/attribute narrowing, Ref id-requiredness, **Project** (`openDocument` returns a
  Document carrying `query`/`transaction`), and namespace relations (`RootElementOf` = `'SCL'`,
  `ParentsOf ⊆ ElementsOf`, `DescendantsOf<'SCL'> ∋ 'LNode'`, …).
- **Hooks** — all hook signatures statically scanned (below); cost confirmed via the trace.
- **Not audited:** core's `Store` internals and a handful of non-consumer exports — not the SCL
  surface SET consumes. The kitchen-sink is a representative sample, used only for the consumer-delta
  number — not for coverage.

## TL;DR verdict

1. **Instantiation cost is HEALTHY — this is not a throughput problem.** scl whole-program is
   ~121k instantiations, core ~131k. TanStack Table v9's _unoptimized_ core was **1.23M** (optimized
   to 267k). Dialecte already sits ~2× below their _optimized_ target. The four TanStack perf
   techniques would yield only marginal instantiation gains here.
2. **There is exactly one material perf win, and it's non-breaking.** A single internal hook
   (`hooks/after-created/private-wrapper.ts:57`) accounts for **~1046ms — roughly half of scl's
   whole-program check time** — via a 143-way type comparison. It's library-internal, so fixing it
   needs no API change and no SET migration.
3. **The real problem is readability / developer experience, not compiler speed.** Every public
   method renders at **3,500–7,600 characters** (universal `import("…")` module-noise = cause C1), and
   editor hovers additionally explode the element union into ~200 members (C2/C4, as seen on
   `getAttribute`/`getTree`). This is what Iteration 2/3 should prioritise.

## A. Instantiation baseline (whole-program)

| Package · path            | Instantiations | Types   | Symbols | Check |
| ------------------------- | -------------- | ------- | ------- | ----- |
| core · check (`--noEmit`) | 130,985        | 89,845  | 190,259 | 1.47s |
| core · declaration-emit   | 131,904        | 90,135  | 190,923 | 1.10s |
| scl · check (`--noEmit`)  | 120,960        | 104,529 | 327,895 | 2.30s |
| scl · declaration-emit    | 124,345        | 104,954 | 332,007 | 2.83s |

Emit ≈ check for both (no large divergence) — unlike TanStack pre-optimization, declaration emit is
not a separate hazard here.

## B. Where the cost actually is (kitchen-sink + per-construct micros)

| Scenario                                | Instantiations | Δ vs baseline |
| --------------------------------------- | -------------- | ------------- |
| micro: baseline (just `import { Scl }`) | 113,047        | —             |
| micro: ref-distribution (C2/C4/C5)      | 114,320        | +1,273        |
| micro: scl-query (C1 containers)        | 113,047        | +0            |
| micro: merged-extensions                | 113,064        | +17           |
| micro: children-of (indexing floor)     | 113,167        | +120          |
| **kitchen-sink (full consumer usage)**  | 115,704        | **+2,657**    |

**Finding:** 93% of the cost (113k of 121k) is the **base type surface loaded on import** — the
config-driven namespace + generated constants — not call sites. A heavy consumer file (the
kitchen-sink: deep `getTree`, many `getAttributes`/`getChild`/`findDescendants`/`addChild`) adds only
**+2,657**. Referencing `Scl.Query`/`Transaction`/`Document` adds **+0** (already resolved on import).
So the C1–C6 patterns are a **rendering/readability** issue far more than an instantiation-count one.

## C. Hot spot (trace + analyze-trace)

Complete hot-spot list across the whole scl compile (analyze-trace, threshold 100ms — this is _all_
of them, not just the top):

```
Check file …/hooks/after-created/private-wrapper.ts              1123ms   ← the only fixable hot spot
Check file …/node_modules/typescript/lib/lib.dom.d.ts            291ms    (unavoidable lib)
Check file …/definition/definition.generated.ts                 210ms    (generated config, value-level)
Emit declarations …/config/dialecte.config.d.ts                 108ms    (emitting the config decl)
```

The dominant cost (private-wrapper.ts:57):

```
  line 57: const ancestors = await query.findAncestors(parentRecord)
     └ Compare types … (917ms) over a 143-member Union of
        { "<ElementName>" & ParentsOf<GenericElement> & GenericParentElement }
```

`wrapWithPrivateElementIfNeeded` is doubly generic — `GenericElement` and
`GenericParentElement extends Scl.ParentsOf<GenericElement>` (private-wrapper.ts:15-16). Passing its
`RawRecord<GenericParentElement>` into the generic `findAncestors` forces TS to relate a 143-way
union-of-intersections. The function only uses its records structurally (reads
`.namespace`/`.tagName`/`.children`/`.attributes`), so **dropping the generics in favour of a wide
record type (e.g. `RawRecord<ElementsOf>`) removes the hot spot with zero public-API impact** — the
single highest-leverage perf change available, halving scl check time.

**Hook-pattern scan (all hooks, verified — not assumed):** the doubly-generic
`<El, ParentEl extends ParentsOf<El>>` shape exists in _only_ the `after-created` family —
`afterCreated`, `wrapWithPrivateElementIfNeeded`, `handleParentAsPrivateRecordCase`,
`handleExistingPrivateRecordCase`, `handleNewPrivateRecordCase`. All other hooks (`beforeClone`,
`beforeDelete`, `afterUpdated`, `setRefPaths`, `cleanOrphanedRefs`, `enforceUuidAttribute`,
`afterStandardizedRecord`, `updateRefPaths`) use only the single `<El extends ElementsOf>` generic.
Of the after-created family, **only private-wrapper appears in the trace** — because the cost is the
`findAncestors(parentRecord)` call, not the signature alone. So the P1 fix is narrowly scoped: that
call site + the family's signatures.

## D. Readability audit (the user-facing problem)

`readability-audit.md` (Compiler-API render, hover fidelity). **186 members audited — 145 methods
(Query/Transaction/Document/Project incl. extension groups) + 41 namespace type aliases; 80 flagged.**
Highlights:

- **Worst offender — an SCL extension method the kitchen-sink never touched:**
  `Scl.Query.reference.buildElementPath` = **13,796 chars, a 210-member element union**
  (C1 + C2/C4 + C3). Sampling would have missed it; the full audit caught it.
- **All core Query/Transaction verbs render at 3,500–7,600 chars; every one flagged C1**
  (`import("…/extensions/…/index")` references baked into the bound-extension types). Heaviest:
  `findDescendants` (7,611), `getAttribute` (7,548), `getAttributes` (7,367), `findAncestors` (7,128).
- **Project** (used across SET): `openDocument` renders at **915 chars, flagged C1** — this is the
  `Document<Config, MergedExtensions<{…import(…)…}>>` you saw on `testdocument`. `queryFirst`/`queryAll`
  ~480–500 chars; `import`/`export`/blob methods are small.
- **`Scl.ElementsOf` is itself a 3,432-char union** (and `ChildrenOf`/`DescendantsOf<ElementsOf>`
  ~3,424) — the C4 root. The namespace _aliases_ render small (by name); the size shows up wherever the
  element union is inlined (param positions, `omit`/`unwrap`, `tagName`).
- Most extension methods are small (≤640 chars); the C1 noise concentrates in the core verbs, Project's
  `openDocument`, and the `reference.buildElementPath` outlier.
- **C6 (recursive)** additionally on `getTree`, `findDescendants`, `deepClone`.
- **C2/C4 (the ~200-member element-union explosion)** is what you observed in real editor hovers on
  `getAttribute`/`getTree`. Note: `typeToString` renders the _folded_ form (`RefOrRecord<Config,
ElementsOf<Config>>`), so the explosion is the **editor's quickinfo expansion** of a distributive
  `Ref` over `ElementsOf<Config>` — i.e. it's display-time, fixable by naming/non-distributive input,
  not an inherent instantiation cost (consistent with section B).

## E. Comparison to the TanStack article ("their methodology, our numbers")

|                                 | TanStack v9 core (unopt → opt) | Dialecte (core / scl)   |
| ------------------------------- | ------------------------------ | ----------------------- |
| Whole-program instantiations    | 1,230,007 → 266,723            | 130,985 / 120,960       |
| Declaration-emit instantiations | 1,146,896 → 161,432            | 131,904 / 124,345       |
| Consumer "kitchen-sink"         | 221,006 → 74,583               | +2,657 over a 113k base |

Dialecte's instantiation profile is **already in (better than) TanStack's post-optimization range**.
Their headline 78–86% reductions came from taming a 14.7×-vs-v8 regression Dialecte simply doesn't
have. **We adopt their _measurement methodology and a subset of techniques_, but the perf upside is
small** — the techniques are worth applying mainly where they _also_ improve readability.

## F. Reprioritised fix list (by measured impact)

**Perf (small surface — only one item matters):**

- **P1 — Fix the hook generics (non-breaking).** Drop `GenericElement`/`GenericParentElement` from
  `wrapWithPrivateElementIfNeeded` & sibling hooks; accept wide record types. ~Halves scl check time.
  _Do first; it's the only measured perf win._
- **P2 — `in out` variance + single-pass `MergedExtensions` (non-breaking).** Marginal on
  instantiations (variance probing isn't a measured hot spot, merged-extensions cost is +17). Keep as
  low-cost hygiene, not a headline.
- **Drop/deprioritise:** depth-caps (B9) — no recursion blow-up measured (kitchen-sink +2.6k);
  `definition` widening (B6) — base surface is generated _value_ consts, no type indexes it. Keep B9
  only as a safety rail, skip B6 unless a future bench shows a win.

**Readability (the real value — order by reach):**

- **R1 — Named container types + interface conversion (kills C1 everywhere).** Annotate
  `Project.openDocument`/factory returns with the named `Scl.Document`/`Scl.Project`, and convert
  `Scl.Document`/`Query`/`Transaction` to `interface … extends`. This is the single biggest hover-
  quality win and removes the `import("…")`/intersection noise from all 27 methods. Structural →
  Iteration 3, but low risk per the SET audit (skipLibCheck, no namespace augmentation).
- **R2 — `Prettify` on record return types (C5, non-breaking).** Removes `RawRecord & { status }`
  seams so results render as `TrackedRecord<Config, "DOS">`.
- **R3 — Name the element union (C4, non-breaking).** `type SclElementName = ElementsOf<Config>` so
  `tagName`/`omit`/`unwrap` render by name instead of a 200-literal union.
- **R4 — Non-distributive / narrowed record input (C2/C3).** The structural fix for the
  `getAttribute`/`getTree` hover explosion (`Ref` distributing over `ElementsOf<Config>` + the 6-way
  `RefOrRecord`). Most design-sensitive (touches the universal input param) → Iteration 3 + SET gate;
  `toRef` already normalises inputs at runtime, so the runtime contract is unchanged.

## Gate

**Stop here and review.** Headline: perf is fine (one easy non-breaking win in a hook); the work
worth doing is readability. Iteration 2 = P1 + R2 + R3 (+ P2 hygiene), all non-breaking; Iteration 3
= R1 + R4 behind structural-equality assertions and the SET type-check gate.

---

## Iteration 2 — progress

**P1 — after-created hook generics (DONE, verified).** Relaxed `GenericParentElement extends
ParentsOf<GenericElement>` → `extends ElementsOf` across the after-created family
(`private-wrapper.ts`), removing the 143-way union comparison at the `findAncestors(parentRecord)`
call.

| Metric                         | Before   | After     | Δ     |
| ------------------------------ | -------- | --------- | ----- |
| whole-program check time       | 2.30s    | **1.03s** | −55%  |
| private-wrapper trace cost     | ~1,123ms | **179ms** | −84%  |
| whole-program instantiations   | 120,960  | 115,109   | −4.8% |
| import baseline instantiations | 113,047  | 107,196   | −5.2% |

Non-breaking: hooks are internal (not in scl's public export surface), no public `.d.ts` change, no
SET impact. Narrowing net green; baseline.json updated.

**Core pass — investigated locally, outcome below.** scl consumes core as a _published package_
(`node_modules/@dialecte/core`), so core edits reach scl only via a release. Each candidate was
implemented in core and measured:

| Core candidate                 | Result                                                                                                                                  | Decision                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `Prettify` records (R2)        | core instantiations **130,985 → 146,463 (+12%)** — `Prettify` is itself a mapped type, multiplied across the pervasive record types     | **Rejected** (bad trade for a minor seam-cleanup)         |
| `in out` variance (P2)         | core neutral (130,985 → 130,908); sound (core type-check green). Consumer-side benefit is the TanStack hypothesis — **unmeasured** here | **Defer to a core PR** (validate via core's own build/CI) |
| single-pass `MergedExtensions` | micro showed +17 instantiations (not a bottleneck)                                                                                      | **Skipped**                                               |

Inspection also pinned the real per-method hover bloat: the `getAttributes`/`getTree` size is the
**type-parameter constraint `GenericElement extends <210-element union>`** rendered in full (×2 per
overload) plus `import("…").Config` — **not** extension noise. That is structural: it's the editor
expanding a resolved 200-element union, fixable only by the Iteration-3 levers (R1 interface
conversion of the containers; R4 non-distributive/narrowed input) — not by naming or `Prettify`.

**Propagation note:** validating core edits _through scl_ requires core's real build (vite-plugin-dts
resolves the `@/*` path aliases); a raw `tsc --emitDeclarationOnly` overlay is unfaithful. So core
changes should be validated in the core repo's own CI, then released.

**Net Iteration 2:** the one measured win is **P1** (scl, shipped here, −55% check time). The
non-breaking _core_ levers don't materially help (variance neutral, Prettify regresses, merge
marginal). The substantive readability wins (R1/R4) are Iteration 3 — structural, behind the SET gate.

---

## Coverage upgrade — complete & config-derived (replaces the sampled micros)

The hand-written micros + sampled kitchen-sink were Iteration-1 diagnostics. They're now replaced by
**complete, config-driven coverage** generated by `scripts/gen-coverage.ts` (its `generateCoverage`
function is **dialect-agnostic** — reusable by any dialect via its config + namespace; intended for
promotion to `@dialecte/core`):

- `coverage.surface.generated.ts` — type fan-out over **every element × every per-element namespace
  generic** (`{ [E in Scl.ElementsOf]: Scl.X<E> }[Scl.ElementsOf]`, indexed to force eager
  instantiation). Needs only the namespace name; self-maintaining (new elements auto-covered).
- `coverage.calls.generated.ts` — valid calls for **every core verb** (reads AND mutations) across
  **every element and every valid (parent,child) relationship** (210 elements, 619 edges). Mutation
  verbs (`addChild`/`ensureChild`) need valid attribute **values**; these are derived from the rich
  `DEFINITION` (`fixed` → first `enumeration` member → `'x'`), so even enum/literal-typed required
  attrs (e.g. `unit:'V'`, `mustUnderstand:'true'`) type-check. **Zero errors, no method excluded.**

| Scenario                                                 | Marginal instantiations | Per-unit              |
| -------------------------------------------------------- | ----------------------- | --------------------- |
| coverage: surface (complete types)                       | **+18,244**             | ~5.8 / (element×type) |
| coverage: calls (complete verbs×schema, incl. mutations) | **+152,677**            | ~36 / call            |
| kitchen-sink (representative)                            | +2,657                  | —                     |

**Comparison to the sampled approach:** the complete numbers are far larger (the sample only touched
~20 elements/handful of calls), but **per-unit cost is linear — no element or relationship explodes**.
So the exhaustive coverage _confirms_ the original verdict (type cost is healthy, scales linearly with
usage, no hidden pathological construct) rather than overturning it — now backed by the whole schema,
not a vague example. These two scenarios are the CI-gated worst-case ceiling; `gen-coverage` runs
before every bench so they track the live schema.
