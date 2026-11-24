# Move

Move an element within its document through the same review as a template merge: report the move, let the person
rename it at its new parent, then write it. `tx.lifecycle.reportMove` reports, `tx.lifecycle.applyMove` writes; the
commit follows the move (paths, references, terminals, wrappers) as it does for any `tx.any.move`.

```ts
// 1. the report, in a transaction of its own that is discarded (core keeps no savepoint)
let report: MoveReport | undefined
const review = await doc.prepare(async (tx) => {
	report = await tx.lifecycle.reportMove({ ref, parent })
})
review.discard()
if (!report || report.refusals.length > 0 || report.nothingToMove) return showRefusals(report)

// 2. the move written, the name the person chose (or the proposed one), then the commit preview for Confirm
let preview: CommitPrune | undefined
const prepared = await doc.prepare(async (tx) => {
	await tx.lifecycle.applyMove({ ref, parent, rename: { name: chosenName } })
	preview = await tx.cleanUp.commitPrune()
})
if (await confirmed(preview)) await prepared.commit()
else prepared.discard()
```

## `reportMove`

`tx.lifecycle.reportMove({ ref, parent, before? })` stages the move in its transaction, which must hold nothing staged
(`ASSERTION_FAILED` otherwise), and returns a `MoveReport`: a `DiffReport` a merge review renders as it is, with

- one instance (`rootRef` the element, `title` its name, or its tag when it has none, `linked: false`, `upToDate: false`:
  only a report with nothing to move is up to date), whose `tree` is one `moved` node (`instanceRef`, `sourceRef`
  and `appliedRef` the element itself, `movedFrom`, `movedTo`, no children) and one group (`change: 'moved'`,
  `suggestedAction: 'accept'`, the element's `editableAttributes`); `summary.moved` is 1, `mappings` and
  `templateInstances` are empty;
- `move`: the `element`, `from`, `to`, `subtreeSize` (the records it carries, itself included, a `Private` wrapper left
  out), `followingReferences` (the references whose uuid, path or names the commit rewrites to follow it, those it clears
  left out; an address only carried along with its control block is not one),
  `reordered: true` when it only changes place among its parent's children, and `nameTaken` when a sibling at the new
  parent holds its name: the `attribute`, `value`, `constraint`, `collidesWith` and the `proposed` name, numbered as
  `tx.lifecycle.makeUnique` numbers (`F1` -> `F1_1`). A name taken sets `needsDecisions`; it is never a refusal;
- `refusals`: every reason the move cannot be written, each with the `key`, `code`, `meta` and `detail` of its error:
  core's refusal of the anchors (`MAX_OCCURRENCES_REACHED`, `MOVE_INTO_OWN_SUBTREE`, `MOVE_BEFORE_NOT_SIBLING`,
  `PROTECTED_ROOT`, `ELEMENT_NOT_FOUND` for the element or the parent; nothing staged, no instance), a move the commit
  does not follow (`MOVE_NOT_FOLLOWED`), and a key none of whose fields can be changed shared at the new parent
  (`IDENTITY_COLLISION`);
- `nothingToMove: true`, and nothing else, when the element already sits where it is asked to go.

What the commit removes beside the move is not in the report: the commit preview after `applyMove` lists it
(`tx.cleanUp.commitPrune`), the same as in the report's own transaction.

## `applyMove`

`tx.lifecycle.applyMove({ ref, parent, before?, rename? })` moves the element, refuses an `IDENTITY_COLLISION` at its new
parent, then writes the editable attributes `rename` gives (the others are ignored); a name taken there, typed or not,
is numbered, so without a `rename` the name the report proposed is written. It returns the moved record. A move the
commit does not follow is refused at the commit (`MOVE_NOT_FOLLOWED`), as the report listed it.
