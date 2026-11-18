### Added

- A fork of an IED (`scenario: 'fork'`) on an open ISD document refuses a file that is not a version of it, before anything is read further, with `NOT_A_VERSION_OF_FILE` (`SCL1015`). `meta.reason` tells the cases apart:
  - `other-file`: the two Headers name different files (`fileUuid`, `otherFileUuid`). A re-extraction of the same IED is another file, and so is a file imported without a Header uuid, since the import gives it a fresh one;
  - `other-ied`: the same file holds another IED (`iedUuid`, the open ISD's first IED, and `otherIedUuid`, each only when that IED carries a uuid).

  A fork into a project (any document that is not an ISD) is unchanged: it is a first placement.
