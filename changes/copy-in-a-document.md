### Added

- `query.lifecycle.report` and `tx.lifecycle.apply` copy a Function (`verb: 'fsd'`) or an Application with every function it composes (`verb: 'asd'`) inside one document with `scenario: 'copy'` (`sourceQuery` the document's own query, `anchor` the parent picked): every element a uuid of its own, the lineage (`templateUuid` / `originUuid`) as copied, no provenance written, everything under the anchor, the roles and categories it shares reused, the variables and behaviours applying to it copied with it, the references it carries outside kept as written, a name taken there numbered.
- A copy's report lists the copied LNodes it releases from their IED (`unbinds`: `iedName` `None`, `ldInst` and `lnUuid` removed, the naming its specification gives, the specification IED of its `LNodeSpecNaming` removed, its implementation references cleared) and every refusal its commit would raise (`refusals`: the incoherent uuid references it copies, by the source element); `apply` writes the unbinds as listed.
- `DecisionGroup.keyTaken` (`KeyTaken`: `constraint`, `values`, `takenBy`, `proposed`) on the group of each root a copy places when a sibling where it lands holds its key: the values `apply` writes unless the review types others.
- A copy from another document, with `ssd` / `ied`, of a root other than a Function or an Application, with `sharedFunctions: 'merge'`, or of an application whose functions sit under several parents is refused with `OPTION_NOT_AVAILABLE`; an anchor the copy cannot sit under with `INVALID_PARENT_CHILD`.
- The types `CopyUnbind`, `CopyWrite` and `KeyTaken` are exported from the package entry.

### Changed

- **Breaking:** `MovedElement.nameTaken` (`NameTaken`) is replaced by `keyTaken` (`KeyTaken`: the `constraint`, the key's `values`, `takenBy`, the `proposed` values), the shape a copy's report gives; `NameTaken` is no longer exported.

### Removed

- **Breaking:** the `preserve` mode of `tx.identity.writeIdentity` (`IdentityMode` is `'strip' | 'stamp-template' | 'keep'`) and its `sourceQuery` / `sourceRoots` parameters: a copy keeps the lineage as copied (`keep`) wherever it is pasted.
