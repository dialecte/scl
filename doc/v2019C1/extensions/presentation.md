---
description: Presentation extension for @dialecte/scl v2019C1 -- human-readable element titles + i18n labels for UI rendering.
---

# Presentation

The `presentation` extension provides query helpers to derive display strings from SCL elements -- used for tree labels, breadcrumbs, panels, and i18n.

## Query methods

Access via `doc.query.presentation`.

### `extractElementTitle`

Returns the human-readable title for any SCL element. By default returns a
plain string; opt into `<Labels>` collection with `withLabels: true` to get
a `{ title, labels }` payload.

```ts
// default: title only
const title = await doc.query.presentation.extractElementTitle(ref)
// string

// opt-in: title + i18n labels
const result = await doc.query.presentation.extractElementTitle(ref, { withLabels: true })
// { title: string; labels: Record<string, Record<string, string>> }
```

`labels` is a two-level map `[lang][id]` -> text from `<Labels>/<Label lang="..." id="...">` children (empty when none). The inner `id` key is the IEC `id` attribute of the `<Label>`, or `''` when absent -- so a typical single-label-per-language file lives entirely under the empty-string id.

The engine never picks a language or id; the consumer chooses:

```ts
// default label for current language, fall back to English, then to the title
const display = result.labels[currentLang]?.[''] ?? result.labels.en?.[''] ?? result.title

// targeted variant (e.g. short vs long form)
const short = result.labels[currentLang]?.short ?? result.labels.en?.short
```

#### Options

```ts
type Options = {
	mode?: 'compact' | 'full'
	withLabels?: true // pass `true` to receive { title, labels }
}
```

- `mode` -- defaults to `'compact'`. Use `'full'` to opt into the full-form spec for elements that define one (e.g. `LNode`, `ExtRef`, `FCDA`, `SubscriberLNode`, `ControllingLNode`).
- `withLabels` -- omit (or false) to receive the title string only and skip `<Labels>` traversal. Pass `true` when you need i18n labels.

### Title resolution

The title is computed using the first non-empty rule:

1. **`TITLE_FIELDS_OVERRIDE` spec** for the tag (compact, or full when requested).
2. **`record.value`** -- XML text body. Handles tags like `BayType`, `IEDName`, `Val` automatically (no special-casing required).
3. **`DEFINITION.identityFields`** fallback (`name` > `id` > first field).
4. **`tagName`**.

### Labels resolution

`labels` (only collected when `withLabels: true`) is read from `<Labels>/<Label>` children defined by IEC 61850-6:

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
	compact: string | string[] // template string with {attr} placeholders OR attribute list
	full?: string | string[]
	separator?: string // default '' when fields is string[]
	fullSeparator?: string // defaults to separator
}
```

- **String[]** -- list of attribute names joined by `separator`. Empty values are dropped before joining.
- **Template string** -- supports `{attrName}` placeholders and arbitrary literals (parentheses, brackets, etc.). The renderer collapses repeated `/`, drops empty `[]` pairs, and trims edge `/`, so optional attributes (e.g. `ExtRef.srcCBName`, `FCDA.ix`) can be embedded directly without conditional logic.

### Separator conventions

| Separator | Meaning                                              | Example                              |
| --------- | ---------------------------------------------------- | ------------------------------------ |
| (none)    | concatenation of attributes that form one identifier | `PXCBR1` (prefix + lnClass + lnInst) |
| `.`       | DA chain segments                                    | `doName.daName`, `pDO.pDA`           |
| `/`       | path segments inside the same identifier system      | `iedName/ldInst/PXCBR1`              |
| `[ix]`    | instance index or qualifier appended to a path       | `CMD[1]`, `...stVal[ST]`             |

### Built-in overrides

| Element                  | Compact title                                                    | Full title                                                                                  |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `LNode`                  | `prefix + lnClass + lnInst`                                      | `iedName/ldInst/prefix+lnClass+lnInst`                                                      |
| `LN` / `LN0`             | `prefix + lnClass + inst`                                        | -                                                                                           |
| `LDevice`                | `inst`                                                           | -                                                                                           |
| `ConnectedAP`            | `iedName/apName`                                                 | -                                                                                           |
| `GSE` / `SMV`            | `ldInst/cbName`                                                  | - (full needs parent `iedName`; deferred)                                                   |
| `Private`                | `type`                                                           | -                                                                                           |
| `EnumVal`                | `ord`                                                            | -                                                                                           |
| `Association`            | `associationID`                                                  | -                                                                                           |
| `ConnectivityNode`       | `pathName`                                                       | -                                                                                           |
| `FunctionRoleContent`    | `roleInst`                                                       | -                                                                                           |
| `Resource`               | `resInst`                                                        | -                                                                                           |
| `Hitem` / `History`      | `version.revision`                                               | -                                                                                           |
| `ControlRef`             | `output[outputInst]/pLN.pDO/controlled`                          | -                                                                                           |
| `SourceRef`              | `pLN.pDO.pDA`                                                    | `service/Input[inputInst]/pLN.pDO.pDA/source`                                               |
| `FunctionCatRef`         | `function`                                                       | -                                                                                           |
| `FunctionRef`            | `function`                                                       | -                                                                                           |
| `AllocationRoleRef`      | `allocationRole`                                                 | -                                                                                           |
| `PowerSystemRelationRef` | `powerSystemRelation`                                            | -                                                                                           |
| `BehaviorDescriptionRef` | `behaviorDescription`                                            | -                                                                                           |
| `ProcessResourceRef`     | `processResource`                                                | -                                                                                           |
| `LNodeDataRef`           | `data`                                                           | -                                                                                           |
| `FunctionCategoryRef`    | `functionCategory`                                               | -                                                                                           |
| `LNodeInputRef`          | `sourceRef`                                                      | -                                                                                           |
| `LNodeOutputRef`         | `controlRef`                                                     | -                                                                                           |
| `ApplicationScRef`       | `fileType v{version}.{revision}`                                 | `fileUuid/fileType v{version}.{revision}`                                                   |
| `LNodeSpecNaming`        | `sIedName/sLdInst/sPrefix+sLnClass+sLnInst`                      | -                                                                                           |
| `SubscriberLNode`        | `pLN(service)`                                                   | `resourceName/inputName/pLN(service)`                                                       |
| `ControllingLNode`       | `pLN`                                                            | `resourceName/pLN`                                                                          |
| `InputVar`               | `varName:inputName`                                              | -                                                                                           |
| `OutputVar`              | `varName:outputName`                                             | -                                                                                           |
| `ExtRef`                 | `iedName/ldInst/prefix+lnClass+lnInst.doName.daName[/srcCBName]` | `pServT/intAddr/pLN.pDO.pDA/iedName/ldInst/prefix+lnClass+lnInst.doName.daName[/srcCBName]` |
| `FCDA`                   | `ldInst/prefix+lnClass+lnInst.doName.daName[fc]`                 | `ldInst/prefix+lnClass+lnInst.doName.daName[fc][ix]` (`[ix]` dropped when empty)            |

Tags not listed fall through to `record.value` (text-content elements like `BayType`, `IEDName`, `Val`) or to identityFields.

### Examples

```ts
const ied = { tagName: 'IED', id: 'ied-1' }
const title = await doc.query.presentation.extractElementTitle(ied)
// 'IED_A'

const withLabels = await doc.query.presentation.extractElementTitle(ied, { withLabels: true })
// {
//   title: 'IED_A',
//   labels: {
//     en: { '': 'Protection IED A' },
//     fr: { '': 'IED de protection A' },
//   },
// }

const lnode = { tagName: 'LNode', id: 'lnode-1' }
const t1 = await doc.query.presentation.extractElementTitle(lnode)
// 'PXCBR1'

const t2 = await doc.query.presentation.extractElementTitle(lnode, { mode: 'full' })
// 'IED_A/LD0/PXCBR1'
```

### Consumer i18n pattern

```ts
function displayName(t: ElementTitle, locale: string, id = ''): string {
	const lang = locale.toLowerCase()
	return t.labels[lang]?.[id] ?? t.labels.en?.[id] ?? t.title
}
```
