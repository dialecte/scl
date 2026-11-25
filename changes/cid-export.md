### Added

- `tx.lifecycle.extract.ied` writes a CID of one real IED (`fileType: 'CID'`): the IED as the project holds it, its own connections with their addresses and the data types it uses, the project recorded at the `Header`. Inputs bound to an IED the file does not hold are reduced to the only form a system tool may write: one without `intAddr` left out, one with `intAddr` kept without its source; outputs kept without their signal. Receivers and report clients naming such an IED are kept and listed, or left out with `clientRefs: 'cleanAbsent'`; associations, key distribution entries and supervisions naming one are kept and listed. `interactingIeds` is required (`'none'`; `'publishers'` is not available yet). Refusals: `IED_NOT_IMPLEMENTED` (`SCL2015`) for a specification IED, `IED_NOT_CONNECTED` (`SCL2016`) for an IED without a network address.
- `query.lifecycle.exportOptions({ iedRef })`: the file types an IED can be exported as, each offered or refused with the error the export would throw.
- New warnings of `extract.ied`: `input-removed`, `input-unbound`, `ied-reference-dangling`, `supervision-source-absent`.
- New types: `CidExtractParams`, `IsdExtractParams`, `IedExtractBase`, `IedExtractResult`, `InteractingIeds`, `ClientRefs`, `IedExportFileType`, `IedExportOption`, `IedExportRefusal`.

### Changed

- `tx.lifecycle.extract.ied` returns `fileName` beside `warnings`: the name the file is suggested to be saved as, with its extension (`ISD_<IED>.isd` for an ISD).
- `IedExtractParams` is the union of `IsdExtractParams` and `CidExtractParams`; code that read an ISD option through `IedExtractParams[...]` reads it from `IsdExtractParams`.
