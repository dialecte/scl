### Added

- `extract.ied` writes an IID of a real IED (`fileType: 'IID'`): the IED alone as the project holds it, every binding, receiver and report client kept as it is, its own communication with its addresses, the data types it needs, its `IEDSourceFiles` and `MinRequestedSCDFiles` as the source holds them, and its `owner` written as the project's `Header` id when it holds none; `includeSubstation` as for a CID. Suggested file name `<IED>.iid`. New warnings: `input-bound-outside` (an input or output bound to an IED the file does not hold, kept with its binding) and `bound-lnodes-not-carried` (the LNodes the IED implements, the substation part not written). An IED with no address is written. New type `IidExtractParams`. `interactingIeds` and `clientRefs`, options of a CID, are refused on an IID (`OPTION_NOT_AVAILABLE`).
- `query.lifecycle.exportOptions` lists the IID after the CID: offered for a real IED, refused `IED_NOT_IMPLEMENTED` for a specification IED.

### Fixed

- The reference planner's `keep-listed` action on an input or an output now lists it (`input-bound-outside`), as the action promises ("written and listed"); it wrote it without a word before. No policy shipped so far used it on inputs or outputs: the CID reduces them, a copy plans no IED reference; the IID is the first.
