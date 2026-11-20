### Added

- An update moves a process-section primary (a `Function` or an `Application`) whose source level changes: an instance's template update, an IED's specification update and a fork alike report it as one `moved` change on the primary (`movedFrom` the level it sits in, `movedTo` the level of the instance the source level stands on, or the source level when the update adds it, the move then depending on that level's group), and an accepted move writes it with `tx.move` after the frame's additions and before its removals, keeping its record. Before, the primary stayed where it was, or was recreated under its new level when its old one was removed.
- An IED update moving a function or an application of its specification lists, in `otherIedImpacts`, each input or output of the substation that another IED is bound to or specified on and that names it, or what it holds, by a full path (`effect: 'renamed'`): the move waits for a decision (`changes-another-ied`), suggested `skip`. Accepted, the reference names it at its new place.

### Changed

- A level a template update or a fork gains is no longer inferred as standing on a project level that carries the lineage of another level of the same template: such a level is that other level's instance. A level the consumer maps it onto, or a project level carrying no lineage of the template, still can be. Before, a gained level holding only a primary moved out of another level stood on that other level's instance.
