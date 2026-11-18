### Changed

- Following the references of many signals (SourceRef, ControlRef) reads their siblings in at most 3 store reads, whatever their number, was two reads per parent: a rename or a new naming above many signals reads less. Names and paths are unchanged.
