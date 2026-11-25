### Changed

- **Behaviour change: a tuple reference created by names only is no longer bound silently to an element that was there before.** The commit gives a reference the transaction creates with names and no uuid (an `ExtRef`, an `FCDA`, an `IEDName`, a `ClientLN`...) the uuid of the element its names name only when the same transaction creates that element; naming an element that already existed, it is left names-only. A reference whose names are edited still takes the uuid its names give, as before. A stored names-only reference takes a uuid from a later rename or move only when its names come to name an element they did not name before: a rename or a move leaving what its names name unchanged (its access point renamed, its own IED renamed, its device moved to another access point) no longer binds it.

### Added

- `query.reference.resolveTuple({ reference, parent })`: the element each pair of a tuple reference about to be written names by its names, read as the commit reads them (`[{ uuidAttribute, uuid, target }]`, one per pair naming exactly one element). A caller creating a reference by names writes those uuids with the names. `query.reference.resolveTuples({ references })` answers many at once, their reads shared. Types `TupleReferenceDraft`, `TupleToResolve`, `ResolvedTuplePair`.
