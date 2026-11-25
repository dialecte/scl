### Fixed

- A `Private` of another namespace (a vendor's `<v:Private xmlns:v="…">`) is read as an ordinary element everywhere scl steps through a `Private` itself, as core reads it since 0.16 (scl requires 0.17.0):
  - a key held inside it is unique under it, and a read of a section of the document (`collectWithAncestry` with a `select`) reaches what it holds through it, as `getTree` does;
  - `info.search` names it among a hit's ancestors;
  - a placed instance's diff lists it as the project's own instead of its children, a text-only one is no text wrapper, and an update lands a template element held in it under the instance's own element, never in a wrapper of its own;
  - `transplant.deep` no longer merges it into the SCL `Private` of the same `type`, nor an SCL `Private` into it, and a clone keeps an empty one;
  - an element written in an SCL `Private` (a 6-100 element added to a bay or inside a vendor `Private`, or moved to one, the `LNodeSpecNaming` an import or a commit gives an `LNode`) never goes into a vendor one of the same `type`, and the naming of an `LNode` is read from its SCL `Private` only;
  - a logical node inside one is not native;
  - the scaffolding of linked SSD units leaves one out with what it holds, as any element of its own;
  - an element put in one is reported as moved into it, and an emptied one is not pruned as a namespace wrapper.
    SCL documents answer as before, with no more store calls.
- `isNamespaceWrapper` takes the record's `tagName` and `namespace` with its attributes, to tell the SCL `Private` from a vendor's.
