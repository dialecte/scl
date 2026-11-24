### Fixed

- A rebuild re-deriving an LLN0 LNode onto the LN0 of a logical device the IED holds already gives that LN0 the LNode's own `lnType` (reported as `retyped` on that LN0, its values judged on it); before, the LN0's type won and the retype was reported, and written, on the LN0 left behind.
- A rebuild re-deriving an LLN0 LNode onto an LN0 another LNode that stays binds is refused `ln-collision`, nothing written; before, two LNodes ended up bound to one LN0.
- `rebuild.implementedElsewhere` lists every logical node of the IED no LNode binds whose LNode a real IED implements now, wherever it sits, and is reported even when every LNode given left for a real IED; before, it listed only the orphans of the logical devices the run built, and stayed empty when no LNode given stayed bound.
