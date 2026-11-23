### Fixed

- On import, a reference carrying both an LNode's uuid and a path naming that LNode's data (a `SourceRef`, `ControlRef`, `ProcessEcho`, `LNodeDataRef`, an `InputVar` / `OutputVar` `dataName`) gets the data names its path carries beside the uuid (`sourceDoName` / `sourceDaName`, `doName` / `daName`), as one carrying the path alone already did. When the data model of the file does not split them (a path stopping at the LNode included, a data object being required beside the uuid), it is left as read with a `data-path-not-split` warning. Before, such a reference kept its uuid without its data names.
- On import, a behaviour variable of a `BehaviorDescription` held by a Function (or any level other than an LNode) reads its `dataName` from that level down to the LNode, then the data (`SF1/XCBR1.Pos.stVal`): it gets the LNode's uuid and its data names. Before, the path was read as data of the Function itself: the variable got no uuid, or kept its uuid with an `incoherent-reference` warning.
- On import, a reference whose path and uuid name two elements is written again from the element its uuid names without the data the path named on the other element (`S1/F1/SF1/XCBR1`, not `S1/F1/SF1/XCBR1.Op.general`).

### Added

- Import diagnostic `exclusive-reference-groups` (`warning`, type `ExclusiveReferenceGroupsDiagnostic`): a behaviour variable naming data and its input or output at once (the two groups are never set together) is reported, each group still read as written; `meta.attributes` lists the reference attributes it holds. `EXCLUSIVE_REFERENCE_TAGS` names the reference tags whose pairs are exclusive groups; `BEHAVIOR_DATA_HOLDER_TAG` the element whose behaviour names its own data alone.
