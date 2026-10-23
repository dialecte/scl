# Revision twins

Small copies of the revision pairs of the real-file corpus (`../corpus/`, not published), committed with the tests
that read them. Each twin is a file in two revisions (`<name>.r1.<ext>`, `<name>.r2.<ext>`): one Header uuid, the
revision one on, the element uuids kept, and the same kind of change as the real pair. Only what the tests read is
kept; names are neutral, uuids are fixed and readable (`00000000-0000-4000-8000-<number>`).

The lifecycle tests are written in three tiers:

1. a behaviour: inline minimal XML in the test, one rule per case;
2. a realistic shape: these twins;
3. the real files: at most one test per pair in the `corpus` vitest project, which skips when the corpus is not
   synced (`npm run corpus:sync`).

| Twin                                  | Copied from                                       | What the second revision changes                                                              |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `application-renames-functions` (ASD) | `CB_Light` v1r1 → v1r2                            | three subfunctions renamed (every path naming them follows), the application's `type` changed |
| `application-gains-elements` (ASD)    | `P51_App` v0r1 → v0r2                             | gains a function role and the behaviour description it refers to                              |
| `function-type-gains-data` (FSD)      | `XCBR` v2r1 → v2r2                                | the logical node type gains a data object, under the same id                                  |
| `two-level-bay-template` (SSD)        | `Transformer Bay template` v0r1 → v0r2, repaired  | gains a dataflow from one application to the other: a signal role and two inputs per level    |
| `variant-application` (ASD)           | `P21_App` and its SSD3 instance, `CB_App`'s group | inside and outside the selection of variants its committed instance made, a variant gained    |

The two-level bay template holds instances of the other twins (the renamed application's second revision on both
levels, the gaining application's first one on the high-voltage level): the instances carry their elements' uuids as
`templateUuid`, and their application provenance names those files. Its real pair is excluded from the corpus (six of
its references name elements of the files it was built from); the twin is copied from the repaired pair, see
`two-level-bay-template.md`.

A twin may come with its project instance, `<name>.instance.<ext>`: a project holding an instance of the first revision the
way a tool left it (`variant-application.instance.ssd`, see `variant-application.md`).
