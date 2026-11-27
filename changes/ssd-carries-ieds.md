### Added

- `extract.ssd` carries the IEDs the scope's LNodes are tied to, with their communication. `ieds` chooses them: a rule by kind and assignment (`{ specification, implemented, shared: 'carry' | 'leave-out' }`) or an explicit list; the default `ALL_BOUND_IEDS` carries every one, `TEMPLATE_IED_SELECTION` only the specification IEDs the scope alone uses. A carried IED keeps its source files, its minimum SCD files and its lineage (a real IED stays real). An LNode bound to it keeps its binding, its data and the inputs and outputs implementing its specified ones; one bound to an IED not carried is released. A list naming an IED tied to no LNode of the scope is refused (`EXTRACT_IED_NOT_BOUND`, `SCL2017`).
- `extract.ssd` takes `fileType: 'SSD' | 'SCD' | 'by-content'` (default `'SSD'`; `'by-content'` writes an SCD when a real IED is carried) and returns the file type written.
- `extract.ssd` takes `addresses: 'drop' | 'keep'`: by default an SSD leaves the `Address` of each carried connection, GSE and SMV out (`address-not-carried`) and an SCD keeps them; an SCD written without them is told incomplete (`scd-incomplete`).
- An input or output of a carried IED naming an IED not carried keeps its signal names and loses their uuids and the control block it names (`external-input`); one naming it by uuid only is reduced. A receiver or report client naming such an IED is left out.
- New warnings: `ied-not-carried`, `external-input`, `address-not-carried`, `scd-incomplete`.

### Changed

- `extract.ssd` no longer drops the IEDs and the Communication of the source: by default every IED the scope's LNodes are tied to is written, real ones included, and their LNodes keep their bindings (before, every bound LNode was released). Pass `ieds: TEMPLATE_IED_SELECTION`, or a list, to carry fewer.
- `extract.ssd` writes the data types of the LNodes held by a level or an equipment, as for those a function holds.

### Removed

- The `sections-not-carried` warning of `extract.ssd`.
