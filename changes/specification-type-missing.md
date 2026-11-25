### Fixed

- `tx.specification.stageIsd` refuses an LNode whose `lnType` names an LNodeType the project lacks with `SPECIFICATION_STAGE_REFUSED`, reason `type-missing` (the LNode as `ref`, the type in the detail), before anything is written, and so does a logical node of the shell IED whose `lnType` names an LNodeType the shell document lacks (that LN as `ref`); before, the data-model reader threw a raw `ELEMENT_NOT_FOUND` ("LNodeType not found") midway.
- `tx.specification.buildIed` and `query.specification.planIed` refuse an LNode already bound to the IED whose `lnType` names an LNodeType neither document holds with `type-missing`, as they already refused a new LNode; before, a rebuild went on with the broken type.
