### Added

- `dataflow.unsubscribe` accepts `cleanup: 'unused-data'` to remove unread data-set entries, empty data sets and unused
  control blocks when the publisher's capabilities allow it. Its result lists removed publisher data, retained items
  and changed configuration revisions.

### Changed

- Data-set structure and reference changes now raise every surviving control block's configuration revision by
  10,000, including the delete cascade.
