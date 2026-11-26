### Changed

- `tx.lifecycle.apply` and `tx.lifecycle.extract.fsd` / `.asd` / `.ssd` / `.ied` report one progress plan of captioned phases whose bar only moves forward, the clones and type imports they run as its sub-bar, instead of a bar that filled and emptied once per copied element. The commit after them keeps its own plan; a plan opened in the transaction body holds both.
