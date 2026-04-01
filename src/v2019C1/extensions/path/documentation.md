# Path resolution documentation

## XML Sample

```xml
<SCL>
  <Substation name="S1">
    <Voltage Level name="V1">
      <Bay name="B1">

        <!-- TARGET: Function is a target element -->
        <Function name="Protection" uuid="..." />

        <!-- TARGET: LNode is a target element -->
        <LNode iedName="PIU" ldInst="CB" lnClass="XCBR" lnInst="1" uuid="..." />

        <SubFunction name="Trip">
          <!-- REFERRER: FunctionRef has a path attr pointing to Function above -->
          <FunctionRef function="S1/V1/B1/Protection" />

          <!-- REFERRER: SourceRef has a path attr pointing to LNode above,
                         with a DO/DA qualifier (.Pos.stVal) -->
          <SourceRef source="S1/V1/B1/XCBR1.Pos.stVal" />
        </SubFunction>

      </Bay>
    </VoltageLevel>
  </Substation>
</SCL>
```

## Phase 1 — beforeImportRecord (one call per element, in document order)

The SAX parser streams elements one by one. For each element the hook receives the element as `record` and the current ancestor stack as `ancestry`.

**When `<Function name="Protection">` arrives:**

`Function` is in `TARGET_ELEMENT_TYPES` (it's a target of `FunctionRef.function`).

```ts
buildElementPath({ record: Function, ancestry: [S1, V1, B1] })
// → "S1/V1/B1/Protection"

pathIndex.set('S1/V1/B1/Protection', '<uuid-of-Function>')
```

**When `<LNode iedName="PIU" ...>` arrives:**

`LNode` is also a target type.

```ts
buildElementPath
// → "S1/V1/B1/XCBR1"   (prefix="" + lnClass="XCBR" + lnInst="1")

pathIndex.set('S1/V1/B1/XCBR1', '<uuid-of-LNode>')
```

When `<FunctionRef function="S1/V1/B1/Protection">` arrives:

`FunctionRef` is in `ELEMENTS_WITH_REFERENCES`. Its pair is `{ attribute: { path: 'function', uuid: 'functionUuid' }, resolution: 'direct' }`.

```ts
pathValue = "S1/V1/B1/Protection"
parseReferencePath("FunctionRef", "function", pathValue)
  // → resolution = 'direct'
  // → { lookupKey: "S1/V1/B1/Protection" }

pendingResolutions.push({
  recordId: <id-of-FunctionRef>,
  uuidAttributeName: "functionUuid",
  lookupKey: "S1/V1/B1/Protection",
})
```

**When `<SourceRef source="S1/V1/B1/XCBR1.Pos.stVal">` arrives:**

Its pair: `{ attribute: { path: 'source', uuid: 'sourceLNodeUuid' }, resolution: 'lnode' }`.

```ts
pathValue = "S1/V1/B1/XCBR1.Pos.stVal"
parseReferencePath("SourceRef", "source", pathValue)
  // → resolution = 'lnode' → parseLnodeSpecPath(...)
  // → strips ".Pos.stVal" from last segment
  // → { lookupKey: "S1/V1/B1/XCBR1", qualifier: "Pos.stVal" }

pendingResolutions.push({
  recordId: <id-of-SourceRef>,
  uuidAttributeName: "sourceLNodeUuid",
  lookupKey: "S1/V1/B1/XCBR1",
})
```

End of phase 1: all records are in IndexedDB unmodified, and we have:

```ts
pathIndex = {
  "S1/V1/B1/Protection", // → "<uuid-of-Function>"
  "S1/V1/B1/XCBR1",      // → "<uuid-of-LNode>"
  ...
}

pendingResolutions = [
  { recordId: FunctionRef-id, uuidAttributeName: "functionUuid", lookupKey: "S1/V1/B1/Protection" },
  { recordId: SourceRef-id, uuidAttributeName: "sourceLNodeUuid", lookupKey: "S1/V1/B1/XCBR1" },
]
```

## Phase 2 — afterImport (single call, after all records are stored)

No more streaming. Walk every pending resolution and hit the index:

```ts
'S1/V1/B1/Protection' // → found → uuid = "<uuid-of-Function>"
// → updates: [{ recordId: FunctionRef-id, attributes: [{ name: "functionUuid", value: "<uuid-of-Function>" }] }]

'S1/V1/B1/XCBR1' // → found → uuid = "<uuid-of-LNode>"
// → updates: [{ recordId: SourceRef-id,  attributes: [{ name: "sourceLNodeUuid", value: "<uuid-of-LNode>" }] }]
```

Bulk-write those attribute updates to IndexedDB. Clear `pathIndex` and `pendingResolutions`.

---

Why two phases?
Because XML can reference elements that appear later in the file — a FunctionRef near the top could point to a Function near the bottom. If you tried to resolve immediately in phase 1, the target might not exist yet. Phase 1 collects everything; phase 2 resolves once all targets are guaranteed to be indexed.

## Resolution strategies

32 of 33 reference pairs are resolved. Each pair is assigned a `resolution` value in `UUID_REFERENCE_PAIRS`.

### `direct` — 19 pairs

The path attribute value is an exact match against a target element's computed path.

| Element                 | Path attribute        | Target                                           |
| ----------------------- | --------------------- | ------------------------------------------------ |
| AllocationRoleRef       | `allocationRole`      | AllocationRole                                   |
| BehaviorDescriptionRef  | `behaviorDescription` | BehaviorDescription                              |
| BehaviorReference       | `behaviorReference`   | BehaviorDescription                              |
| ControllingLNode        | `resourceName`        | ProcessResource                                  |
| ControlRef              | `resourceName`        | ProcessResource                                  |
| FunctionCategoryRef     | `functionCategory`    | FunctionCategory, SubCategory                    |
| FunctionCatRef          | `function`            | Function, SubFunction                            |
| FunctionRef             | `function`            | Function, SubFunction, EqFunction, EqSubFunction |
| FunctionalVariantRef    | `functionalVariant`   | FunctionalVariant, FunctionalSubVariant          |
| LNodeInputRef           | `sourceRef`           | SourceRef                                        |
| LNodeOutputRef          | `controlRef`          | ControlRef                                       |
| PowerSystemRelation     | `relation`            | ConductingEquipment, PowerTransformer, …         |
| PowerSystemRelationRef  | `powerSystemRelation` | PowerSystemRelation                              |
| ProcessResourceRef      | `processResource`     | ProcessResource                                  |
| ProjectProcessReference | `processReference`    | Process                                          |
| Resource                | `source`              | Substation, Bay, Function, LNode, …              |
| SourceRef               | `resourceName`        | ProcessResource                                  |
| SubscriberLNode         | `resourceName`        | ProcessResource                                  |
| VariableRef             | `variable`            | Variable                                         |

**Example:** `FunctionRef.function="S1/V1/Protection"` → index lookup `"S1/V1/Protection"` → populates `functionUuid`.

### `lnode` — 7 pairs

Path to an LNode or IED LN, optionally followed by `.DO[.SDO…][.DA[.BDA…]]` qualifiers. The qualifier chain can be arbitrarily deep (e.g., `MMXU1.PhV.phsA.cVal.mag.f` — 5 levels).

`parseLnodePath` splits on `/`, finds the first `.` in the last segment, and returns everything before it as `lookupKey` and everything after as `qualifier`.

Two path formats share this strategy:

- **Substation hierarchy** (`LNodeSpecNaming`): path from SCL root through Substation elements to an `LNode`
- **IEC 7-2 ObjectReference**: `IEDName/LDeviceInst/LNRef.DO[.SDO][.DA]` — targets `LN`/`LN0` inside the IED section (AccessPoint and Server are transparent in the index)

| Element      | Path attribute | Target  |
| ------------ | -------------- | ------- |
| ControlRef   | `controlled`   | LNode   |
| DAS          | `mappedDaName` | LN, LN0 |
| DOS          | `mappedDoName` | LN, LN0 |
| LNodeDataRef | `data`         | LNode   |
| ProcessEcho  | `source`       | LNode   |
| SDS          | `mappedDoName` | LN, LN0 |
| SourceRef    | `source`       | LNode   |

**Example (substation):** `SourceRef.source="S1/B1/PXCBR1.Pos.stVal"` → `lookupKey: "S1/B1/PXCBR1"` → populates `sourceLNodeUuid`.

**Example (IEC 7-2):** `DOS.mappedDoName="PIU/CT_Function/I01ATCTR1.AmpSv"` → `lookupKey: "PIU/CT_Function/I01ATCTR1"` → populates `mappedLnUuid`.

### `ied-address` — 2 pairs

References to ExtRef/ExtCtrl inside the IED section, identified by their `intAddr` attribute. ExtRef/ExtCtrl contribute `intAddr` as a path segment with `.` separator, so they are indexed at paths like `"PIU/CB_Function/LCBO1.TrCmd.stVal"`.

| Element    | Path attribute | Target  |
| ---------- | -------------- | ------- |
| SourceRef  | `extRefAddr`   | ExtRef  |
| ControlRef | `extCtrlAddr`  | ExtCtrl |

**Two variants** (per IEC TR 61850-90-30):

| Variant      | When                                | extRefAddr value                    | Lookup                                                                              |
| ------------ | ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Full path    | LNode not mapped to IED             | `PIU/CB_Function/LCBO1.TrCmd.stVal` | Direct match                                                                        |
| IED-relative | LNode mapped to IED (`iedName` set) | `CB_Function/LCBO1.TrCmd.stVal`     | Fallback: prepend `iedName` from parent LNode → `PIU/CB_Function/LCBO1.TrCmd.stVal` |

**Implementation:** `parseReferencePath` returns `lookupKey` = raw value and `fallbackLookupKey` = `iedName + "/" + raw value` (when `iedName` is found in ancestry). `afterImport` tries the primary key first, then the fallback.

### `behavior-description` — 4 pairs

References within a BehaviorDescription scope. Paths are local — relative to the BehaviorDescription's parent element (typically an LNode), not absolute from the SCL root.

| Element   | Path attribute | Target     | Lookup strategy                              |
| --------- | -------------- | ---------- | -------------------------------------------- |
| InputVar  | `dataName`     | LNode      | Context path = LNode path; value = qualifier |
| InputVar  | `inputName`    | SourceRef  | Context path + `.` + stripped name           |
| OutputVar | `dataName`     | LNode      | Context path = LNode path; value = qualifier |
| OutputVar | `outputName`   | ControlRef | Context path + `.` + stripped name           |

**Context resolution:** `parseBehaviorDescriptionPath` walks ancestry backwards to find the nearest `BehaviorDescription`, then builds the path from all ancestors before it (e.g., `S1/B1/XCBR1`).

**Disambiguation stripping:** `inputName` / `outputName` can carry instance suffixes `(N)` (e.g., `Trip(2)`) or DA qualifiers (e.g., `Trip.pDA`). `stripDisambiguation` removes these before lookup.

**Example:** `InputVar.inputName="Trip"` inside a BehaviorDescription under `S1/B1/XCBR1` → `lookupKey: "S1/B1/XCBR1.Trip"` → matches the indexed SourceRef → populates `inputUuid`.

### `unsupported` — 1 pair (VariableApplyTo XPath)

| Element         | Path attribute | Reason                                                     |
| --------------- | -------------- | ---------------------------------------------------------- |
| VariableApplyTo | `element`      | Relative XPath expression — not indexable during streaming |

**Why it's different from all other pairs:**

All other `tPathName` attributes contain **naming-based paths** (`S1/V1/B1/Protection`) — segments built from element `name` or `lnClass` attributes. VariableApplyTo's `element` attribute uses **XPath expressions** (`.//LNode//eIEC61850-6-100:LNodeSpecNaming`), despite sharing the same XSD type `tPathName`.

**Key characteristics (per IEC TR 61850-90-30 §12.3.3):**

1. **Relative to context element** — the `.` means the element containing the `Private/Variable` (e.g. a Bay). The XPath evaluates from that context node.
2. **Can target multiple elements** — `//` is the descendant-or-self axis. `.//LNode` matches _every_ LNode under the context, not just one. One VariableApplyTo → N target elements → N UUID resolutions needed.
3. **XPath subset used in practice** — `.` (self), `//Element` (descendant by tagName), `/Element` (child by tagName), `[@attr="value"]` (attribute predicate). No unions, position predicates, or functions.

**Why the path index can't handle it:**

Our pathIndex is name-based: `"S1/V1/B1/Protection"` → UUID. XPath is **tag-name based**: `.//LNode` matches elements by tagName, not by their `name` attribute. These are fundamentally different lookup mechanisms. `.//LNode//LNodeSpecNaming` cannot be translated into a regular path index lookup.

**Why it can't be resolved during streaming (phase 1):**

XPath requires the full tree. A VariableApplyTo near the top of the file could reference elements that appear later. The target elements may not exist yet when the VariableApplyTo is encountered by the SAX parser.

**Future resolution approach:**

Post-import XPath evaluation in phase 2 (afterImport), once all records are in the database:

1. Detect XPath values (starts with `.` or `//`) during phase 1 → store context element + raw XPath in a pending list
2. In phase 2, for each pending XPath:
   - Decompose into steps (reuse `splitXpathIntoSteps` from assert-xml helper)
   - Walk the record tree from the context element: `/` → children by tagName, `//` → descendants by tagName, `[@attr="value"]` → attribute filter
   - Result = set of matching records (1 or many)
   - Write `elementUuid` for each match

**Current safeguard:**

When a VariableApplyTo with an XPath `element` value is encountered during import, an `unsupported-xpath-reference` warning is emitted. This ensures the edge case is visible rather than silently skipped.

## Coverage summary

| Strategy               | Pairs                      | Status |
| ---------------------- | -------------------------- | ------ |
| `direct`               | 19                         | ✅     |
| `lnode`                | 7                          | ✅     |
| `ied-address`          | 2 (+ IED-relative variant) | ✅     |
| `behavior-description` | 4                          | ✅     |
| `unsupported` (XPath)  | 1                          | ❌     |
| **Total**              | **32 / 33**                |        |
