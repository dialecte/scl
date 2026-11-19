### Changed

- The dataflow verbs read the data types of the document by the tags of the types and their members only, when a signal names its data by a path qualifier: the values, texts and enumerations of the document are no longer read for it. On a 9 MB system file that read went from 18 store reads and 9,787 records to 11 and 3,892, from 27-38 ms to 12-14 ms in memory and from 63-68 ms to 26-30 ms on SQLite. The data types and the dataflows come back the same, also inside a transaction.
