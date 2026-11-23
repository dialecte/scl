### Changed

- `tx.cleanUp.commitPrune()` also returns `moves` and `released`: each element the commit's moves remove (a reference
  its new place cannot reach, a terminal left naming a node its container may not name, and what goes with either),
  with why it goes, and each `LNode` the commit released from a logical node the transaction deleted, with the
  binding it had and the one it is left with. With the containers and the types, they name every record the commit
  removes beyond the edits, each once.
- The commit prunes the containers before the types, and the type prune reads what every earlier step wrote, so a
  type the commit's own cascades stop naming goes too; a `DataTypeTemplates` the type prune empties is pruned by a
  second pass after it. Hardening: no cascade reaches a type referrer today, and every commit writes what it wrote
  before.
- `tx.cleanUp.commitPrune()` lists what a container the commit prunes takes **outside** itself: every reference the
  prune deletes or clears beyond the container's own subtree is now on that container's `goesWith`, under the
  container whose removal caused it (a `FunctionCategoryRef` naming a pruned `FunctionCategory`, a `VariableRef`
  naming a pruned `Variable`). Each entry of `goesWith` carries the `identity` of the element it names (its `name`,
  `uuid` and `type` where its tag has them), beside its `element` and its `effect`; the control blocks of a pruned
  data set are listed as before.
