### Performance

- Reading the elements of a subtree below the document root, with the records above each (the LDevice or element a rename follows, the IED a supervision dependency is read from), reads that subtree a level at a time instead of the whole document. A logical device renamed on a 9.5 MB document commits in about 250 ms instead of 1.1 s on SQLite.
- Naming signals among their siblings (`SourceRef`, `ControlRef`) when an import, or a commit resolving paths, indexes every target is linear: the names the siblings share are counted once per parent, where every signal used to read all its siblings. The names are the same. On a 9.5 MB document, resolving the paths of 20 retargeted FunctionRefs takes about half the time in memory.
