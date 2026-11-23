---
description: Specification extension for @dialecte/scl v2019C1 — what an allocation role holds and which IEDs implement it.
---

# Specification

The `specification` extension reads the specification side of a project: which logical nodes an allocation role holds
and how far they are implemented.

## Query methods

Access via `doc.query.specification`.

### `roleLNodes`

The logical nodes of an allocation role, the IEDs implementing them, and the ones not implemented yet.

```ts
doc.query.specification.roleLNodes(params: {
  allocationRole: Scl.Ref<'AllocationRole'>
}): Promise<RoleLNodes>

type RoleLNodes = {
  lnodes: Scl.Ref<'LNode'>[]                 // every LNode below the functions the role names, once, document order
  implementers: {
    ied: Scl.Ref<'IED'>
    name: string
    kind: 'implemented' | 'specification'    // the rule of lifecycle.classifyIeds
    lnodes: Scl.Ref<'LNode'>[]               // the role's LNodes this IED implements
  }[]                                        // document order of the IEDs
  unimplemented: Scl.Ref<'LNode'>[]          // LNodes no logical node implements
  unresolvedFunctionRefs: Scl.Ref<'FunctionRef'>[] // references naming no function
}
```

- **The functions of a role** — each `FunctionRef` names its function by `functionUuid`, else (no uuid, or one naming
  nothing) by its `function` path, as `reference.resolveReferencePaths` resolves it. A
  function nested in another one the role names adds nothing twice; LNodes of nested subfunctions and equipment
  functions count.
- **A role names no IED** — the implementers are read from the LNodes: the LN their `lnUuid` or their name path names
  (as `reference.resolveMappedLNodes`). An LNode left unassigned (`iedName` "None" or absent, no `lnUuid`) whose `DOS`,
  `SDS` or `DAS` names an LN by `mappedLnUuid` counts as implemented by that LN's IED (a real IED's, when its data names LNs of several IEDs): several LNodes implemented by one
  logical node keep their specification and document the mapping in their data.
- **Several IEDs, several roles** — one role may be implemented by several IEDs, and one IED may serve several roles:
  the answer lists every implementer, it never refuses.
- **Specification IEDs** — an LNode bound to a specification IED is listed under it with `kind: 'specification'`; it
  is specified, not implemented by a real device.
- Refuses with `ELEMENT_NOT_FOUND` when the document holds no such allocation role.
- A fixed number of reads, whatever the size of the role.

```ts
const { implementers, unimplemented } = await doc.query.specification.roleLNodes({ allocationRole })
// implementers → [{ ied, name: 'P1', kind: 'implemented', lnodes: [...] }]
// unimplemented → the LNodes still waiting for a device
```

## Exported types

```ts
import type {
	RoleImplementer,
	RoleLNodes,
	RoleLNodesParams,
	FunctionTag,
} from '@dialecte/scl/v2019C1'
```
