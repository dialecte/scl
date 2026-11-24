### Changed

- **Behaviour change: the commit refuses a uuid reference it cannot name coherently** (`REFERENCE_INCOHERENT`, `SCL4004`, `meta: { reference, uuidAttribute, reason }`). A reference the transaction writes (creates holding its uuid, gives a uuid, or whose data names it changes) is refused when:
  - `data-missing`: it holds an LNode uuid without the data object the registry requires beside it (`SourceRef` / `ProcessEcho` `sourceDoName`, `ControlRef` `controlledDoName`, `InputVar` / `OutputVar` / `LNodeDataRef` `doName`);
  - `groups-together`: a behaviour variable (`InputVar`, `OutputVar`) holds its data group and its input or output group at once;
  - `out-of-scope`: a behaviour variable names an element its local path cannot reach, not at or below the level holding its `BehaviorDescription`. Before, such a variable was stored with its uuid and no path.

  A copy (`deepClone`, a lifecycle copy) carrying such a stored reference is refused too. A rename, a move or a delete that only rewrites or clears paths is not. Whether a uuid names an element is not checked yet, except for a behaviour variable left without its path. A behaviour variable written while its element was out of reach, then moved into its reach in the same transaction (its holder or its element moved), gets its local path at the commit.
