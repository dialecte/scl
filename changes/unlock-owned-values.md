### Fixed

- `tx.dataModel.unlockLNode` no longer removes the IED tool's data. For each `DAS` of the LNode it removes only the `Val` the system tool owns: the `DAI`'s effective `valImport` is true, it holds one `Val` without `sGroup`, and that `Val` equals the `DAS`'s (else the type default). The `DAI`, `SDI` and `DOI` above it go only when nothing else is left on them; an `sAddr`, a `desc` or another value keeps them. Before, every `DOI` / `SDI` / `DAI` the specification named was deleted.

### Added

- `unlockLNode` answers `{ removed, kept }`: the elements it removed, and each `DAI` whose value stays with why (`not-imported`, `not-one-value`, `setting-group`, `no-specified-value`, `value-changed`). Types `UnlockLNodeParams`, `UnlockLNodeResult`, `KeptValue`, `KeptValueReason`.
- `readValueImport({ instance, dataAttribute })`: a `DAI`'s effective `valImport` (its own, else its `DA` / `BDA`'s, else `false`), the one reader the unlock and the lifecycle's settable values use.
