---
description: 'Info extension for @dialecte/scl v2019C1 -- what a UI shows and checks about an element (title, state, i18n labels).'
---

# Info

The `info` extension tells what a consumer shows and checks about an SCL element: its title (tree labels, breadcrumbs, panels), its state (a SourceRef open or connected, an LNode locked) and, when asked, its i18n labels.

## Query methods

Access via `doc.query.info`.

### `of`

```ts
const info = await doc.query.info.of(ref)
// ElementInfo: { title: string; state?: ElementState; labels?: Record<string, Record<string, string>> }

const withLabels = await doc.query.info.of(ref, { withLabels: true, mode: 'full' })
```

The type of `state` follows the tag of `ref`: `of({ tagName: 'LNode', id })` returns the state of an LNode (see [State](#state)), a tag without a state has none. `ElementInfo`, `InfoOptions` and the state types are exported from `@dialecte/scl/v2019C1`.

`info.of` replaces the former `presentation.extractElementTitle`: `extractElementTitle(ref)` becomes `(await info.of(ref)).title`, and `withLabels: true` puts `labels` on the same object.

### `ofEach`

```ts
const infos = await doc.query.info.ofEach(refs)
// ElementInfo[], in the order of refs
```

Prefer it over a loop of `of` for a tree or a list: the facts a state needs across the document (the kind of each IED, the LNs by uuid) are read once for the whole call.

#### Options

```ts
type InfoOptions = {
	mode?: 'compact' | 'full'
	withLabels?: boolean
}
```

- `mode` -- defaults to `'compact'`. Use `'full'` to opt into the full-form spec for elements that define one (e.g. `LNode`, `SourceRef`, `ExtRef`, `FCDA`, `SubscriberLNode`, `ControllingLNode`).
- `withLabels` -- collects the `<Labels>` children (one more read per element), so asked for.

`labels` is a two-level map `[lang][id]` -> text from `<Labels>/<Label lang="..." id="...">` children (empty when none). The inner `id` key is the `id` attribute of the `<Label>`, or `''` when absent -- so a typical single-label-per-language file lives entirely under the empty-string id. The engine never picks a language or id; the consumer chooses:

```ts
// default label for current language, fall back to English, then to the title
const display = info.labels?.[currentLang]?.[''] ?? info.labels?.en?.[''] ?? info.title
```

### State

| Tag                       | State                                                                                                                                        | Rule                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceRef`, `ControlRef` | `{ binding: 'open' \| 'connected'; implemented: boolean }`                                                                                   | `connected` once the source (controlled data) is given, by path (`source` / `controlled`) or by uuid; `implemented` once the ExtRef / ExtCtrl is named (`extRefAddr` / `extRefUuid`, `extCtrlAddr` / `extCtrlUuid`), whether connected or not                                                                               |
| `LNode`                   | `{ locked: boolean; mapping: 'unmapped' \| 'specification-ied' \| 'real-ied' }`                                                              | `locked` once an IED is assigned: `iedName` set and not `None` (same rule as `dataModel.isLNodeLocked`). `mapping`: the LN it is bound to, by `lnUuid` (a uuid naming no LN is no binding) else by its identity attributes, and the kind of the IED holding it ([`lifecycle.classifyIeds`](./index#lifecycle-classifyieds)) |
| `ExtRef`, `ExtCtrl`       | `ExtRefState` / `ExtCtrlState`: one of `'empty' \| 'later-binding' \| 'expected' \| 'subscribed' \| 'bound'` (`ExtCtrl` has no `subscribed`) | how completely the signal, the control block and the internal address are written, see below and [Dataflow](./dataflow#states)                                                                                                                                                                                              |

An `ExtRef` and an `ExtCtrl` have a state in a single value, read from how completely the element is written. A signal is _named_ once its logical node is named and its `doName` is given; the logical node is named by its uuid (`lnUuid`) or by its `iedName`, `ldInst` and `lnClass` (`prefix` and `lnInst` may be left out), a uuid naming the element standing for its names. A control block is _named_ the same way, by `srcCBUuid` or `srcCBName`. An `ExtRef` needs its `serviceType` to be `subscribed` or `bound`: without one it stays `expected` whatever else it names. A service published without a control block (polling) needs none; the others need the control block named.

| State           | `ExtRef`                                                                             | `ExtCtrl`                              |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `empty`         | no signal, no `intAddr`                                                              | no signal, no `intAddr`                |
| `later-binding` | no signal, `intAddr` set                                                             | no signal, `intAddr` set               |
| `expected`      | the signal is named, but no service, or not the control block it needs               | the signal is named, no `intAddr`      |
| `subscribed`    | the signal, a service and its control block (if needed) are named, no `intAddr`      | -                                      |
| `bound`         | the signal, a service, its control block (if needed) and the `intAddr` are all given | the signal and the `intAddr` are given |

An `intAddr` alone is never read as a binding: without a named signal the element is `later-binding`, and with a signal but no service, or no control block for a service that needs one, it stays `expected`.

The types: `SignalState` for a SourceRef / ControlRef, `LNodeState` for an LNode (its `mapping` is an `LNodeMapping`), `ExtRefState` and `ExtCtrlState` for an ExtRef and an ExtCtrl, `ElementStateByTag` maps each tag to its state, and `ElementState<Tag>` is the state of a tag - every state when the tag is not known.

A state is read from the element's own attributes; whether a path resolves is a validation question, not a state. Tag text, colours and wording belong to the consumer.

### Title resolution

The title is computed using the first non-empty rule:

1. **`TITLE_FIELDS_OVERRIDE` spec** for the tag (compact, or full when requested).
2. **`record.value`** -- XML text body. Handles tags like `BayType`, `IEDName`, `Val` automatically (no special-casing required).
3. **`DEFINITION.identityFields`** fallback (`name` > `id` > first field).
4. **`tagName`**.

### Labels resolution

`labels` (only collected when `withLabels: true`) is read from `<Labels>/<Label>` children:

```xml
<Substation name="S1">
  <Labels>
    <Label lang="en">Substation One</Label>
    <Label lang="en" id="short">Sub 1</Label>
    <Label lang="fr-FR">Poste numero un</Label>
  </Labels>
</Substation>
```

yields:

```ts
{
  en:    { '': 'Substation One', short: 'Sub 1' },
  'fr-fr': { '': 'Poste numero un' },
}
```

`lang` keys are normalised to lowercase (`en`, `fr-fr`); IEC constrains `lang` to BCP 47 tags (`[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*`). The `id` attribute is used verbatim and defaults to `''` when absent, so multiple labels of the same language are preserved.

### Title spec model

`TITLE_FIELDS_OVERRIDE` entries follow this shape:

```ts
type TitleSpec = {
	compact: string | string[] | ConditionalTitle // template, attribute list, OR ordered variants
	full?: string | string[] | ConditionalTitle
	separator?: string // default '' when fields is string[]
	fullSeparator?: string // defaults to separator
}

type ConditionalTitle = { whenPresent?: string; template: string }[]
```

- **String[]** -- list of attribute names joined by `separator`. Empty values are dropped before joining.
- **Template string** -- supports `{attrName}` placeholders and arbitrary literals (parentheses, brackets, etc.). The renderer collapses repeated `/`, drops empty `[]` pairs, and trims edge `/`, so optional attributes (e.g. `ExtRef.srcCBName`, `FCDA.ix`) can be embedded directly without conditional logic.
- **ConditionalTitle** -- ordered variants; the renderer picks the **first** whose `whenPresent` attribute is non-empty (a variant without `whenPresent` is an unconditional fallback) and renders its template. Used when a title switches between a concrete binding and a specification hint -- e.g. `ApplicationSclRef` falls back to its file type when the version is absent.

### Separator conventions

| Separator | Meaning                                              | Example                              |
| --------- | ---------------------------------------------------- | ------------------------------------ |
| (none)    | concatenation of attributes that form one identifier | `PXCBR1` (prefix + lnClass + lnInst) |
| `.`       | DA chain segments                                    | `doName.daName`, `pDO.pDA`           |
| `/`       | path segments inside the same identifier system      | `iedName/ldInst/PXCBR1`              |
| `[ix]`    | instance index or qualifier appended to a path       | `CMD[1]`, `...stVal[ST]`             |

### Built-in overrides

| Element                  | Compact title                                                                                         | Full title                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `LNode`                  | `prefix + lnClass + lnInst`                                                                           | `iedName/ldInst/prefix+lnClass+lnInst`                                                      |
| `LN` / `LN0`             | `prefix + lnClass + inst`                                                                             | -                                                                                           |
| `LDevice`                | `inst`                                                                                                | -                                                                                           |
| `ConnectedAP`            | `iedName/apName`                                                                                      | -                                                                                           |
| `GSE` / `SMV`            | `ldInst/cbName`                                                                                       | - (full needs parent `iedName`; deferred)                                                   |
| `Private`                | `type`                                                                                                | -                                                                                           |
| `EnumVal`                | `ord`                                                                                                 | -                                                                                           |
| `Association`            | `associationID`                                                                                       | -                                                                                           |
| `ConnectivityNode`       | `pathName`                                                                                            | -                                                                                           |
| `FunctionRoleContent`    | `roleInst`                                                                                            | -                                                                                           |
| `Resource`               | `resInst`                                                                                             | -                                                                                           |
| `Hitem` / `History`      | `version.revision`                                                                                    | -                                                                                           |
| `MinRequestedSCDFile`    | `version.revision` with empty values omitted (never `fileUuid`)                                       | -                                                                                           |
| `ControlRef`             | its name among the ControlRefs of its LNode: `output`, or `output(outputInst)` once another shares it | `name/pLN.pDO/controlled`                                                                   |
| `SourceRef`              | its name among the SourceRefs of its LNode: `input`, or `input(inputInst).pDA` once another shares it | `name/pLN.pDO.pDA/source`                                                                   |
| `FunctionCatRef`         | `function`                                                                                            | -                                                                                           |
| `FunctionRef`            | `function`                                                                                            | -                                                                                           |
| `AllocationRoleRef`      | `allocationRole`                                                                                      | -                                                                                           |
| `PowerSystemRelationRef` | `powerSystemRelation`                                                                                 | -                                                                                           |
| `BehaviorDescriptionRef` | `behaviorDescription`                                                                                 | -                                                                                           |
| `ProcessResourceRef`     | `processResource`                                                                                     | -                                                                                           |
| `LNodeDataRef`           | `data`                                                                                                | -                                                                                           |
| `FunctionCategoryRef`    | `functionCategory`                                                                                    | -                                                                                           |
| `LNodeInputRef`          | `sourceRef`                                                                                           | -                                                                                           |
| `LNodeOutputRef`         | `controlRef`                                                                                          | -                                                                                           |
| `ApplicationSclRef`      | `fileType v{version}.{revision}`                                                                      | `fileUuid/fileType v{version}.{revision}`                                                   |
| `LNodeSpecNaming`        | `sIedName/sLdInst/sPrefix+sLnClass+sLnInst`                                                           | -                                                                                           |
| `SubscriberLNode`        | `pLN(service)`                                                                                        | `resourceName/inputName/pLN(service)`                                                       |
| `ControllingLNode`       | `pLN`                                                                                                 | `resourceName/pLN`                                                                          |
| `InputVar`               | `varName:inputName`                                                                                   | -                                                                                           |
| `OutputVar`              | `varName:outputName`                                                                                  | -                                                                                           |
| `ExtRef`                 | `iedName/ldInst/prefix+lnClass+lnInst.doName.daName[/srcCBName]`                                      | `pServT/intAddr/pLN.pDO.pDA/iedName/ldInst/prefix+lnClass+lnInst.doName.daName[/srcCBName]` |
| `FCDA`                   | `ldInst/prefix+lnClass+lnInst.doName.daName[fc]`                                                      | `ldInst/prefix+lnClass+lnInst.doName.daName[fc][ix]` (`[ix]` dropped when empty)            |

Tags not listed fall through to `record.value` (text-content elements like `BayType`, `IEDName`, `Val`) or to identityFields.

> `ApplicationSclRef` sources its attributes (`fileType`, `version`, `revision`, `fileUuid`) from its child `SclFileReference`, since the IEC schema carries them there rather than on the element itself.

### Examples

```ts
const ied = { tagName: 'IED', id: 'ied-1' }
await doc.query.info.of(ied)
// { title: 'IED_A' }

await doc.query.info.of(ied, { withLabels: true })
// { title: 'IED_A', labels: { en: { '': 'Protection IED A' }, fr: { '': 'IED de protection A' } } }

const lnode = { tagName: 'LNode', id: 'lnode-1' }
await doc.query.info.of(lnode)
// { title: 'PXCBR1', state: { locked: true, mapping: 'real-ied' } }

await doc.query.info.of(lnode, { mode: 'full' })
// { title: 'IED_A/LD0/PXCBR1', state: { locked: true, mapping: 'real-ied' } }

const sourceRef = { tagName: 'SourceRef', id: 'sr-1' }
await doc.query.info.of(sourceRef)
// { title: 'Trip(1).general', state: { binding: 'open', implemented: false } }
```
