### Changed

- Binding an LNode to a logical node by `lnUuid` looks the logical node up by its uuid (one lookup per tag, LN then LN0) and reads its logical device and IED from its ancestors, was a read of every LN and LN0 (on a 9.5 MB SCD on SQLite: 861 records moved, now 11; 7.5 ms, now 1 ms once the attribute index is built). The identity stamped is unchanged.
- Rewriting the addresses of an LNode's signals when its binding changes looks the ExtRefs or ExtCtrls they name up together, one lookup per target tag, was one per signal (one LNode with 951 inputs: 1,911 store calls, now 961). The LNodes a commit releases read their signals below them, and the elements those name by a list of uuids, was every signal and every ExtRef of the document (one LNode: 7,107 records moved, now 20).
- The data of the LNodes a commit releases (`DOS`, `SDS`, `DAS`) is read a level at a time below them, was every `DOS`, `SDS` and `DAS` of the document (100 LNodes: 9,264 records moved, now 4,770, the logical node index included).
- Following the references of many elements read alone reads their ancestors in one batch, one read per level, was one walk per element.
