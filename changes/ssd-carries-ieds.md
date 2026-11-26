### Added

- `extract.ssd` carries the IEDs the scope's LNodes are tied to, with their communication. `ieds` chooses them: a rule by kind and assignment (`{ specification, implemented, shared: 'carry' | 'leave-out' }`) or an explicit list; the default `ALL_BOUND_IEDS` carries every one, `TEMPLATE_IED_SELECTION` only the specification IEDs the scope alone uses. A carried IED keeps its source files and lineage (a real IED stays real); an LNode bound to it keeps its binding and its data, one bound to an IED not carried is released. A list naming an IED tied to no LNode of the scope is refused (`EXTRACT_IED_NOT_BOUND`, `SCL2017`).
- `extract.ssd` takes `fileType: 'SSD' | 'SCD' | 'by-content'` (default `'SSD'`; `'by-content'` writes an SCD when a real IED is carried) and returns the file type written.
- `extract.ssd` takes `addresses: 'drop' | 'keep'` (default `'drop'`): the `Address` of each carried connection and of its GSE and SMV is left out and told (`address-not-carried`).
- New warnings: `ied-not-carried`, `external-input` (an input from an IED not carried keeps its source names and loses their uuids), `address-not-carried`. The reference planner gains the action `keep-names`.
- `cloneTopologyContent` / `ensureTopologyFrame` take `logicalNodeUuids`: an LNode of a level or of its equipment may name those logical nodes and keeps its data.

### Changed

- `extract.ssd` no longer drops the IEDs and the Communication of the source: by default every IED the scope's LNodes are tied to is written, real ones included, and their LNodes keep their bindings (before, every bound LNode was released). Pass `ieds: TEMPLATE_IED_SELECTION`, or a list, to carry fewer.
- `extract.ssd` writes the data types of the LNodes its frame holds (under a level or an equipment), as for those a function holds.

### Removed

- The `sections-not-carried` warning of `extract.ssd`.
