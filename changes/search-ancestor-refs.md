### Added

- `info.search` hits name their ancestors as refs: `SearchHit.ancestors` lists `{ tagName, id }` (`SearchAncestor`, exported) from the root down, the same ancestors in the same order as `ancestorIds` (which stays), so `info.ofEach(hit.ancestors)` titles a hit's path in one call. No new store read.
