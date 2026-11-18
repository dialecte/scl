### Added

- `tx.cleanUp.commitPrune()` lists, without writing, what the commit of the transaction will prune: each container in document order with its identity, its parent, the element a reference path names at or above it, why it goes, every record it holds (another tool's data included) and what goes with it outside (a data set's control blocks cleared and revised), then the types the commit removes as unused. A preview holds only for the staged state it read.
