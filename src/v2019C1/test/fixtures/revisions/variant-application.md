# Variant application: what it was cut from

`variant-application.r1.asd` / `.r2.asd` is an application file with functional variants, and
`variant-application.instance.ssd` a project holding an instance of its first revision with one variant of each group
selected, the way the specification tool leaves it: the variants not selected are gone, so are the markers
(`FunctionalVariantRef`) of every variant, the references the selection removed, the subfunctions only those composed
and what referred to them.

It is cut from the corpus' `Protections_P21_App/P21_App.asd` and its instance in `SSD3/SUBSTATION_v1rA.ssd` (bay
`BAY1`), with neutral names and readable uuids, the uuid relations kept (the instance's elements carry the template's
uuids as `templateUuid`):

| Twin                                                                       | Corpus                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| group `Protection subtype` (`Subtype 01`, `Subtype 02` the baseline, `03`) | the one group of `P21_App` (22 variants, `P21/02` the baseline, the one `BAY1` holds)                            |
| `remove` markers on the function references                                | the 721 markers of `P21_App`, all `remove`                                                                       |
| group `Breaker subtype` (`Single pole` the baseline, `Three pole`), `add`  | the `CB subtype` group of `CB_App/CB_App.xml` and its `add` markers (SSD3's `CBR1_App` holds one variant)        |
| `Teleprotection`, `Pole discrepancy` left out by the selection             | the 51 subfunctions `BAY1` lacks, each composed only by a reference the selection removed                        |
| their process resource reference and category references, left out         | the 29 `ProcessResourceRef` and 51 `FunctionCatRef` naming them                                                  |
| the `LabelInfo` of `Trip conditioning` in `Private type="eTool"`           | the `LabelInfo` a tool keeps in `Private type="eLabelInfo"` of a `Labels`; the instance lacks it, as `BAY1` does |
| the instance's `fileReference` of `Alarm logic`                            | each SSD instance's own behaviour file                                                                           |

The second revision changes, inside the selection, the description of `Distance zone 1`; outside it, the description of
`Teleprotection`; it gains a variant `Subtype 04` and points `Alarm logic` at another behaviour file.

What it leaves out: the other variants and roles, the signal roles, the data references, the settings and every logical
node type but one.
