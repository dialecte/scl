### Added

- `tx.specification.buildIed` and `query.specification.planIed`: build the logical devices, logical nodes, LLN0 and LPHD of a specification IED from logical nodes, and bind each logical node to its own; logical nodes another IED implements are left out and listed; refusals under `SPECIFICATION_BUILD_REFUSED` (`SCL2013`).
- `openValues`: a per-call option of rules for the values the standard leaves open (a missing logical node type, the type of an added LLN0 or LPHD, a logical device name), refused when no rule answers; built-in rules `firstOf`, `sameClassInTargetIed`, `firstOfClass` (also by name in `OPEN_VALUE_RULES`).
- `importTypes` (and `query.dataModel.resolve`) take `lnodeTypeIds`: LNodeTypes imported by id with their closure, whether or not a logical node names them; `buildIed` imports a type it picked from `contextQuery` this way.

### Fixed

- `importTypes` ends its progress plan when it throws: a caller catching the error goes on in its own progress frame.
