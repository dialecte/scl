### Added

- `reference.query.buildElementPaths(query, { refs })` builds the path of many elements at once, one entry per element in input order (`null` for a ref naming nothing or an element without a segment of its own), each exactly as `buildElementPath` builds it: the elements in one store read, their ancestors one read per ancestor level, the signal siblings and spec namings read once, whatever their number (40 LNodes and signals: 9 store reads, was 424 one by one). A ref naming an element of another tag refuses the whole call with `ELEMENT_TAGNAME_MISMATCH`.

### Changed

- `reference.query.buildElementPath` is `buildElementPaths` of one element: the same paths; an element with a path costs one store read and one record fewer outside a transaction (it is no longer read twice), the same as before otherwise.
