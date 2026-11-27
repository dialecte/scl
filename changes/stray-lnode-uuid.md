### Fixed

- **A behaviour variable repeating in `lnodeUuid` the LNode of its input or output no longer blocks a copy, an instantiate or a merge.** An `InputVar` / `OutputVar` naming its input or output (`inputName` / `inputUuid`, `outputName` / `outputUuid`) and holding, as its data group, only the `lnodeUuid` of the LNode holding that input or output (the shape some tools write) was refused at the commit (`REFERENCE_INCOHERENT`, `groups-together`). The commit now drops that `lnodeUuid`, and a `dataName` naming that LNode alone, and refuses nothing; `commitPrune` lists each such variable in its new `normalised` field, with the LNode the dropped attribute named. The copy report lists no refusal for it. Any other variable holding both groups is still refused.

### Added

- Import diagnostic `redundant-lnode-uuid` (information): such a variable is kept as read, no `dataName` written from that `lnodeUuid`, instead of the `exclusive-reference-groups` warning. Type `RedundantLNodeUuidDiagnostic`; `CommitPrune.normalised`, type `NormalisedReferenceGroups`.
