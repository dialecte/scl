# Scl public-type readability audit

Every public method (resolved param + return — the form an editor shows when you hover a call)
and every namespace type is rendered with NoTruncation, then measured. Methods are discovered
dynamically (Query/Transaction/Document/Project incl. extension groups), so this covers core's
classes AND the dialect's extensions. Rows sorted worst-first.

**Columns** — `len`: characters in the render (proxy for hover size; bigger = noisier).
`members`: element-union members surfaced. `causes`: matched root cause(s) (legend below).

**Root-cause legend**

- **C1 module-noise** — `import("…/extensions/…")` refs inflate the render. Fix: name containers / annotate returns.
- **C2/C4 element-union** — the full element-name union appears. Largely inherent to a config-driven DSL.
- **C3 wide-input-union** — a wide multi-member input union, each member expanded.
- **C5 record-seam** — a record renders as `RawRecord<…> & { status }` instead of one clean object.
- **C6 recursive** — self-referential `TreeRecord`/`TreeSelect`.

## Methods — resolved param/return (144 methods discovered)

| Member                                                      | len    | members | causes                                       |
| ----------------------------------------------------------- | ------ | ------- | -------------------------------------------- |
| q.reference.buildElementPath(…) param                       | 13,727 | 210     | C2/C4 element-union×210, C3 wide-input-union |
| tx.reference.buildElementPath(…) param                      | 13,727 | 210     | C2/C4 element-union×210, C3 wide-input-union |
| q.findDescendants(…) → return                               | 7,004  | 0       | C1 module-noise                              |
| tx.findDescendants(…) → return                              | 7,004  | 0       | C1 module-noise                              |
| doc.query.findDescendants(…) → return                       | 7,004  | 0       | C1 module-noise                              |
| q.findByAttributes(…) param                                 | 6,968  | 1       | C1 module-noise                              |
| tx.findByAttributes(…) param                                | 6,968  | 1       | C1 module-noise                              |
| doc.query.findByAttributes(…) param                         | 6,968  | 1       | C1 module-noise                              |
| q.getSnapshot(…) param                                      | 3,525  | 0       | C1 module-noise                              |
| tx.getSnapshot(…) param                                     | 3,525  | 0       | C1 module-noise                              |
| doc.query.getSnapshot(…) param                              | 3,525  | 0       | C1 module-noise                              |
| q.getRecords(…) → return                                    | 3,516  | 0       | C1 module-noise                              |
| tx.getRecords(…) → return                                   | 3,516  | 0       | C1 module-noise                              |
| doc.query.getRecords(…) → return                            | 3,516  | 0       | C1 module-noise                              |
| q.getRecords(…) param                                       | 3,514  | 0       | C1 module-noise                              |
| tx.getRecords(…) param                                      | 3,514  | 0       | C1 module-noise                              |
| doc.query.getRecords(…) param                               | 3,514  | 0       | C1 module-noise                              |
| q.getRecord(…) → return                                     | 3,512  | 0       | C1 module-noise                              |
| tx.getRecord(…) → return                                    | 3,512  | 0       | C1 module-noise                              |
| doc.query.getRecord(…) → return                             | 3,512  | 0       | C1 module-noise                              |
| q.getRecord(…) param                                        | 3,510  | 0       | C1 module-noise                              |
| q.getChild(…) param                                         | 3,510  | 0       | C1 module-noise                              |
| q.getChildren(…) param                                      | 3,510  | 0       | C1 module-noise                              |
| q.findDescendants(…) param                                  | 3,510  | 0       | C1 module-noise                              |
| q.findAncestors(…) param                                    | 3,510  | 0       | C1 module-noise                              |
| q.getTree(…) param                                          | 3,510  | 0       | C1 module-noise                              |
| q.getAttribute(…) param                                     | 3,510  | 0       | C1 module-noise                              |
| q.getAttributes(…) param                                    | 3,510  | 0       | C1 module-noise                              |
| tx.addChild(…) param                                        | 3,510  | 0       | C1 module-noise                              |
| tx.ensureChild(…) param                                     | 3,510  | 0       | C1 module-noise                              |
| tx.update(…) param                                          | 3,510  | 0       | C1 module-noise                              |
| tx.delete(…) param                                          | 3,510  | 0       | C1 module-noise                              |
| tx.deepClone(…) param                                       | 3,510  | 0       | C1 module-noise                              |
| tx.getRecord(…) param                                       | 3,510  | 0       | C1 module-noise                              |
| tx.getChild(…) param                                        | 3,510  | 0       | C1 module-noise                              |
| tx.getChildren(…) param                                     | 3,510  | 0       | C1 module-noise                              |
| tx.findDescendants(…) param                                 | 3,510  | 0       | C1 module-noise                              |
| tx.findAncestors(…) param                                   | 3,510  | 0       | C1 module-noise                              |
| tx.getTree(…) param                                         | 3,510  | 0       | C1 module-noise                              |
| tx.getAttribute(…) param                                    | 3,510  | 0       | C1 module-noise                              |
| tx.getAttributes(…) param                                   | 3,510  | 0       | C1 module-noise                              |
| doc.query.getRecord(…) param                                | 3,510  | 0       | C1 module-noise                              |
| doc.query.getChild(…) param                                 | 3,510  | 0       | C1 module-noise                              |
| doc.query.getChildren(…) param                              | 3,510  | 0       | C1 module-noise                              |
| doc.query.findDescendants(…) param                          | 3,510  | 0       | C1 module-noise                              |
| doc.query.findAncestors(…) param                            | 3,510  | 0       | C1 module-noise                              |
| doc.query.getTree(…) param                                  | 3,510  | 0       | C1 module-noise                              |
| doc.query.getAttribute(…) param                             | 3,510  | 0       | C1 module-noise                              |
| doc.query.getAttributes(…) param                            | 3,510  | 0       | C1 module-noise                              |
| q.getTree(…) → return                                       | 3,509  | 0       | C1 module-noise, C6 recursive                |
| tx.getTree(…) → return                                      | 3,509  | 0       | C1 module-noise, C6 recursive                |
| doc.query.getTree(…) → return                               | 3,509  | 0       | C1 module-noise, C6 recursive                |
| q.findAncestors(…) → return                                 | 3,502  | 0       | C1 module-noise                              |
| q.findByAttributes(…) → return                              | 3,502  | 0       | C1 module-noise                              |
| tx.findAncestors(…) → return                                | 3,502  | 0       | C1 module-noise                              |
| tx.findByAttributes(…) → return                             | 3,502  | 0       | C1 module-noise                              |
| doc.query.findAncestors(…) → return                         | 3,502  | 0       | C1 module-noise                              |
| doc.query.findByAttributes(…) → return                      | 3,502  | 0       | C1 module-noise                              |
| tx.update(…) → return                                       | 3,496  | 0       | C1 module-noise                              |
| tx.deepClone(…) → return                                    | 3,490  | 0       | C1 module-noise                              |
| tx.addChild(…) → return                                     | 3,488  | 0       | C1 module-noise                              |
| tx.ensureChild(…) → return                                  | 3,488  | 0       | C1 module-noise                              |
| q.reference.resolveElementPath(…) → return                  | 3,463  | 0       | —                                            |
| tx.reference.resolveElementPath(…) → return                 | 3,463  | 0       | —                                            |
| q.reference.resolveReferencePath(…) param                   | 3,451  | 0       | —                                            |
| tx.reference.resolveReferencePath(…) param                  | 3,451  | 0       | —                                            |
| q.getRecordsByTagName(…) param                              | 3,432  | 0       | —                                            |
| tx.getRecordsByTagName(…) param                             | 3,432  | 0       | —                                            |
| doc.query.getRecordsByTagName(…) param                      | 3,432  | 0       | —                                            |
| tx.delete(…) → return                                       | 2,503  | 0       | C1 module-noise                              |
| project.openDocument(…) → return                            | 1,116  | 0       | C1 module-noise                              |
| doc.transaction(…) param                                    | 987    | 0       | C1 module-noise                              |
| doc.prepare(…) param                                        | 984    | 0       | C1 module-noise                              |
| doc.prepare(…) → return                                     | 957    | 0       | C1 module-noise                              |
| project.queryAll(…) param                                   | 526    | 0       | C1 module-noise                              |
| project.queryFirst(…) param                                 | 524    | 0       | C1 module-noise                              |
| tx.history.addEntry(…) param                                | 499    | 0       | —                                            |
| tx.extraction.toFsd(…) param                                | 326    | 0       | C1 module-noise                              |
| tx.extraction.toAsd(…) param                                | 307    | 0       | C1 module-noise                              |
| tx.any.deepClone(…) → return                                | 233    | 2       | C1 module-noise                              |
| q.reference.resolveMappedLNode(…) → return                  | 148    | 0       | C1 module-noise                              |
| tx.reference.resolveMappedLNode(…) → return                 | 148    | 0       | C1 module-noise                              |
| q.getRoot(…) → return                                       | 127    | 0       | C1 module-noise                              |
| tx.getRoot(…) → return                                      | 127    | 0       | C1 module-noise                              |
| doc.query.getRoot(…) → return                               | 127    | 0       | C1 module-noise                              |
| tx.extraction.ensureSubstationTemplateStructure(…) → return | 124    | 0       | —                                            |
| q.reference.resolveReferencePath(…) → return                | 111    | 0       | C1 module-noise                              |
| tx.reference.resolveReferencePath(…) → return               | 111    | 0       | C1 module-noise                              |
| q.any.getSnapshot(…) param                                  | 107    | 0       | C1 module-noise                              |
| tx.any.getSnapshot(…) param                                 | 107    | 0       | C1 module-noise                              |
| q.dataModel.resolve(…) → return                             | 87     | 0       | C1 module-noise                              |
| tx.dataModel.resolve(…) → return                            | 87     | 0       | C1 module-noise                              |
| tx.reference.applyTypeIdRemap(…) param                      | 82     | 0       | —                                            |
| tx.any.ensureChild(…) → return                              | 81     | 0       | C1 module-noise                              |
| q.reference.buildReferencePath(…) param                     | 77     | 0       | —                                            |
| tx.reference.buildReferencePath(…) param                    | 77     | 0       | —                                            |
| q.reference.findRefsPointingTo(…) param                     | 76     | 0       | —                                            |
| tx.reference.findRefsPointingTo(…) param                    | 76     | 0       | —                                            |
| project.getBlob(…) → return                                 | 76     | 0       | C1 module-noise                              |
| q.reference.buildElementPath(…) → return                    | 73     | 0       | C1 module-noise                              |
| tx.getStagedOperations(…) → return                          | 73     | 0       | C1 module-noise                              |
| tx.reference.buildElementPath(…) → return                   | 73     | 0       | C1 module-noise                              |
| q.any.findByAttributes(…) param                             | 72     | 1       | —                                            |
| q.dataModel.resolve(…) param                                | 72     | 0       | —                                            |
| tx.any.findByAttributes(…) param                            | 72     | 1       | —                                            |
| tx.dataModel.resolve(…) param                               | 72     | 0       | —                                            |
| project.initEmptyDocument(…) param                          | 61     | 0       | C1 module-noise                              |
| q.any.findDescendants(…) → return                           | 59     | 0       | C1 module-noise                              |
| tx.any.findDescendants(…) → return                          | 59     | 0       | C1 module-noise                              |
| q.any.getRecords(…) → return                                | 57     | 0       | C1 module-noise                              |
| tx.any.getRecords(…) → return                               | 57     | 0       | C1 module-noise                              |
| q.any.getRecord(…) → return                                 | 53     | 0       | C1 module-noise                              |
| q.any.getChild(…) → return                                  | 53     | 0       | C1 module-noise                              |
| tx.any.getRecord(…) → return                                | 53     | 0       | C1 module-noise                              |
| tx.any.getChild(…) → return                                 | 53     | 0       | C1 module-noise                              |
| project.export(…) → return                                  | 52     | 0       | —                                            |
| q.any.getAttribute(…) param                                 | 51     | 0       | C1 module-noise                              |
| q.any.getAttributes(…) param                                | 51     | 0       | C1 module-noise                              |
| q.any.getTree(…) param                                      | 51     | 0       | C1 module-noise                              |
| q.any.findDescendants(…) param                              | 51     | 0       | C1 module-noise                              |
| q.any.findAncestors(…) param                                | 51     | 0       | C1 module-noise                              |
| tx.any.getAttribute(…) param                                | 51     | 0       | C1 module-noise                              |
| tx.any.getAttributes(…) param                               | 51     | 0       | C1 module-noise                              |
| tx.any.getTree(…) param                                     | 51     | 0       | C1 module-noise                              |
| tx.any.findDescendants(…) param                             | 51     | 0       | C1 module-noise                              |
| tx.any.findAncestors(…) param                               | 51     | 0       | C1 module-noise                              |
| project.import(…) → return                                  | 51     | 0       | —                                            |
| project.getDocument(…) → return                             | 51     | 0       | C1 module-noise                              |
| q.any.getTree(…) → return                                   | 50     | 0       | C1 module-noise                              |
| tx.any.getTree(…) → return                                  | 50     | 0       | C1 module-noise                              |
| q.any.getAttribute(…) → return                              | 49     | 0       | C1 module-noise                              |
| tx.any.getAttribute(…) → return                             | 49     | 0       | C1 module-noise                              |
| q.any.getChildren(…) → return                               | 43     | 0       | C1 module-noise                              |
| q.any.getRecordsByTagName(…) → return                       | 43     | 0       | C1 module-noise                              |
| q.any.findAncestors(…) → return                             | 43     | 0       | C1 module-noise                              |
| q.any.findByAttributes(…) → return                          | 43     | 0       | C1 module-noise                              |
| tx.any.getChildren(…) → return                              | 43     | 0       | C1 module-noise                              |
| tx.any.getRecordsByTagName(…) → return                      | 43     | 0       | C1 module-noise                              |
| tx.any.findAncestors(…) → return                            | 43     | 0       | C1 module-noise                              |
| tx.any.findByAttributes(…) → return                         | 43     | 0       | C1 module-noise                              |
| q.signature.elementSignature(…) param                       | 42     | 0       | C1 module-noise                              |
| tx.signature.elementSignature(…) param                      | 42     | 0       | C1 module-noise                              |
| project.getDocuments(…) → return                            | 41     | 0       | C1 module-noise                              |
| project.exportBlob(…) → return                              | 41     | 0       | C1 module-noise                              |
| q.any.getChild(…) param                                     | 39     | 0       | C1 module-noise                              |
| q.any.getChildren(…) param                                  | 39     | 0       | C1 module-noise                              |
| q.any.getAttributes(…) → return                             | 39     | 0       | C1 module-noise                              |
| q.any.getSnapshot(…) → return                               | 39     | 0       | C1 module-noise                              |
| q.getSnapshot(…) → return                                   | 39     | 0       | C1 module-noise                              |
| q.reference.findRefsPointingTo(…) → return                  | 39     | 0       | C1 module-noise                              |
| q.presentation.extractElementTitle(…) param                 | 39     | 0       | C1 module-noise                              |
| tx.any.addChild(…) param                                    | 39     | 0       | C1 module-noise                              |
| tx.any.ensureChild(…) param                                 | 39     | 0       | C1 module-noise                              |
| tx.any.update(…) param                                      | 39     | 0       | C1 module-noise                              |
| tx.any.delete(…) param                                      | 39     | 0       | C1 module-noise                              |
| tx.any.deepClone(…) param                                   | 39     | 0       | C1 module-noise                              |
| tx.any.getChild(…) param                                    | 39     | 0       | C1 module-noise                              |
| tx.any.getChildren(…) param                                 | 39     | 0       | C1 module-noise                              |
| tx.any.getAttributes(…) → return                            | 39     | 0       | C1 module-noise                              |
| tx.any.getSnapshot(…) → return                              | 39     | 0       | C1 module-noise                              |
| tx.getSnapshot(…) → return                                  | 39     | 0       | C1 module-noise                              |
| tx.reference.findRefsPointingTo(…) → return                 | 39     | 0       | C1 module-noise                              |
| tx.presentation.extractElementTitle(…) param                | 39     | 0       | C1 module-noise                              |
| doc.query.getSnapshot(…) → return                           | 39     | 0       | C1 module-noise                              |
| q.history.getLatestHitem(…) → return                        | 38     | 0       | —                                            |
| tx.history.getLatestHitem(…) → return                       | 38     | 0       | —                                            |
| tx.any.addChild(…) → return                                 | 37     | 0       | C1 module-noise                              |
| tx.any.update(…) → return                                   | 37     | 0       | C1 module-noise                              |
| tx.any.delete(…) → return                                   | 37     | 0       | C1 module-noise                              |
| tx.dataModel.importTypes(…) param                           | 37     | 0       | C1 module-noise                              |
| tx.dataModel.importTypes(…) → return                        | 37     | 0       | C1 module-noise                              |
| project.getBlobsByDocument(…) → return                      | 37     | 0       | C1 module-noise                              |
| project.getBlobsByRecord(…) → return                        | 37     | 0       | C1 module-noise                              |
| project.getStandaloneBlobs(…) → return                      | 37     | 0       | C1 module-noise                              |
| tx.extraction.deep(…) param                                 | 36     | 0       | C1 module-noise                              |
| tx.extraction.deep(…) → return                              | 36     | 0       | C1 module-noise                              |
| Scl.Project (container)                                     | 33     | -       | —                                            |
| q.any.getRecords(…) param                                   | 33     | 0       | C1 module-noise                              |
| tx.any.getRecords(…) param                                  | 33     | 0       | C1 module-noise                              |
| project.open(…) → return                                    | 33     | 0       | —                                            |
| q.any.getRecord(…) param                                    | 31     | 0       | C1 module-noise                              |
| tx.any.getRecord(…) param                                   | 31     | 0       | C1 module-noise                              |
| q.history.getSortedHitems(…) → return                       | 28     | 0       | —                                            |
| tx.history.getSortedHitems(…) → return                      | 28     | 0       | —                                            |
| q.reference.resolveMappedLNode(…) param                     | 26     | 0       | —                                            |
| tx.reference.resolveMappedLNode(…) param                    | 26     | 0       | —                                            |
| Scl.Transaction (container)                                 | 15     | -       | —                                            |
| q.reference.buildReferencePath(…) → return                  | 13     | 0       | —                                            |
| tx.reference.buildReferencePath(…) → return                 | 13     | 0       | —                                            |
| Scl.Document (container)                                    | 12     | -       | —                                            |
| Scl.Query (container)                                       | 9      | -       | —                                            |
| q.getFilename(…) param                                      | 9      | 0       | —                                            |
| q.getRoot(…) param                                          | 9      | 0       | —                                            |
| q.getAttribute(…) → return                                  | 9      | 0       | —                                            |
| q.history.getLatestHitem(…) param                           | 9      | 0       | —                                            |
| q.history.getSortedHitems(…) param                          | 9      | 0       | —                                            |
| q.reference.buildMappedLNodePath(…) param                   | 9      | 0       | —                                            |
| tx.getStagedOperations(…) param                             | 9      | 0       | —                                            |
| tx.clearStagedOperations(…) param                           | 9      | 0       | —                                            |
| tx.clearRecordCache(…) param                                | 9      | 0       | —                                            |
| tx.clearCumulativeCloneMappings(…) param                    | 9      | 0       | —                                            |
| tx.commit(…) param                                          | 9      | 0       | —                                            |
| tx.getFilename(…) param                                     | 9      | 0       | —                                            |
| tx.getRoot(…) param                                         | 9      | 0       | —                                            |
| tx.getAttribute(…) → return                                 | 9      | 0       | —                                            |
| tx.history.getLatestHitem(…) param                          | 9      | 0       | —                                            |
| tx.history.getSortedHitems(…) param                         | 9      | 0       | —                                            |
| tx.reference.buildMappedLNodePath(…) param                  | 9      | 0       | —                                            |
| tx.cleanUp.resetLNode(…) param                              | 9      | 0       | —                                            |
| tx.cleanUp.pruneEmptyContainers(…) param                    | 9      | 0       | —                                            |
| tx.cleanUp.orphanUuidRefs(…) param                          | 9      | 0       | —                                            |
| tx.extraction.ensureSubstationTemplateStructure(…) param    | 9      | 0       | —                                            |
| doc.query.getFilename(…) param                              | 9      | 0       | —                                            |
| doc.query.getRoot(…) param                                  | 9      | 0       | —                                            |
| doc.query.getAttribute(…) → return                          | 9      | 0       | —                                            |
| doc.close(…) param                                          | 9      | 0       | —                                            |
| doc.destroy(…) param                                        | 9      | 0       | —                                            |
| project.close(…) param                                      | 9      | 0       | —                                            |
| project.destroy(…) param                                    | 9      | 0       | —                                            |
| project.getDocuments(…) param                               | 9      | 0       | —                                            |
| project.getStandaloneBlobs(…) param                         | 9      | 0       | —                                            |
| project.queryAll(…) → return                                | 9      | 0       | —                                            |
| project.getDatabaseInstance(…) param                        | 9      | 0       | —                                            |
| q.getAttributes(…) → return                                 | 7      | 0       | —                                            |
| tx.getAttributes(…) → return                                | 7      | 0       | —                                            |
| doc.query.getAttributes(…) → return                         | 7      | 0       | —                                            |
| doc.transaction(…) → return                                 | 7      | 0       | —                                            |
| project.queryFirst(…) → return                              | 7      | 0       | —                                            |
| project.getDatabaseInstance(…) → return                     | 7      | 0       | —                                            |
| q.any.getRecordsByTagName(…) param                          | 6      | 0       | —                                            |
| q.getFilename(…) → return                                   | 6      | 0       | —                                            |
| q.reference.resolveElementPath(…) param                     | 6      | 0       | —                                            |
| q.signature.elementSignature(…) → return                    | 6      | 0       | —                                            |
| q.presentation.extractElementTitle(…) → return              | 6      | 0       | —                                            |
| tx.any.getRecordsByTagName(…) param                         | 6      | 0       | —                                            |
| tx.getFilename(…) → return                                  | 6      | 0       | —                                            |
| tx.reference.resolveElementPath(…) param                    | 6      | 0       | —                                            |
| tx.signature.elementSignature(…) → return                   | 6      | 0       | —                                            |
| tx.presentation.extractElementTitle(…) → return             | 6      | 0       | —                                            |
| doc.query.getFilename(…) → return                           | 6      | 0       | —                                            |
| project.open(…) param                                       | 6      | 0       | —                                            |
| project.initEmptyDocument(…) → return                       | 6      | 0       | —                                            |
| project.removeDocument(…) param                             | 6      | 0       | —                                            |
| project.import(…) param                                     | 6      | 0       | —                                            |
| project.export(…) param                                     | 6      | 0       | —                                            |
| project.getDocument(…) param                                | 6      | 0       | —                                            |
| project.openDocument(…) param                               | 6      | 0       | —                                            |
| project.getDocumentConfig(…) param                          | 6      | 0       | —                                            |
| project.getDocumentConfig(…) → return                       | 6      | 0       | —                                            |
| project.undo(…) param                                       | 6      | 0       | —                                            |
| project.redo(…) param                                       | 6      | 0       | —                                            |
| project.addBlob(…) param                                    | 6      | 0       | —                                            |
| project.addBlob(…) → return                                 | 6      | 0       | —                                            |
| project.getBlob(…) param                                    | 6      | 0       | —                                            |
| project.exportBlob(…) param                                 | 6      | 0       | —                                            |
| project.getBlobsByDocument(…) param                         | 6      | 0       | —                                            |
| project.getBlobsByRecord(…) param                           | 6      | 0       | —                                            |
| project.attachBlob(…) param                                 | 6      | 0       | —                                            |
| project.detachBlob(…) param                                 | 6      | 0       | —                                            |
| project.removeBlob(…) param                                 | 6      | 0       | —                                            |
| q.reference.buildMappedLNodePath(…) → return                | 5      | 0       | —                                            |
| tx.reference.buildMappedLNodePath(…) → return               | 5      | 0       | —                                            |
| tx.clearStagedOperations(…) → return                        | 4      | 0       | —                                            |
| tx.clearRecordCache(…) → return                             | 4      | 0       | —                                            |
| tx.clearCumulativeCloneMappings(…) → return                 | 4      | 0       | —                                            |
| tx.commit(…) → return                                       | 4      | 0       | —                                            |
| tx.history.addEntry(…) → return                             | 4      | 0       | —                                            |
| tx.reference.applyTypeIdRemap(…) → return                   | 4      | 0       | —                                            |
| tx.cleanUp.resetLNode(…) → return                           | 4      | 0       | —                                            |
| tx.cleanUp.pruneEmptyContainers(…) → return                 | 4      | 0       | —                                            |
| tx.cleanUp.orphanUuidRefs(…) → return                       | 4      | 0       | —                                            |
| tx.extraction.toAsd(…) → return                             | 4      | 0       | —                                            |
| tx.extraction.toFsd(…) → return                             | 4      | 0       | —                                            |
| doc.close(…) → return                                       | 4      | 0       | —                                            |
| doc.destroy(…) → return                                     | 4      | 0       | —                                            |
| project.close(…) → return                                   | 4      | 0       | —                                            |
| project.destroy(…) → return                                 | 4      | 0       | —                                            |
| project.removeDocument(…) → return                          | 4      | 0       | —                                            |
| project.undo(…) → return                                    | 4      | 0       | —                                            |
| project.redo(…) → return                                    | 4      | 0       | —                                            |
| project.attachBlob(…) → return                              | 4      | 0       | —                                            |
| project.detachBlob(…) → return                              | 4      | 0       | —                                            |
| project.removeBlob(…) → return                              | 4      | 0       | —                                            |
| q.getChild(…) → return                                      | 3      | 0       | —                                            |
| q.getChildren(…) → return                                   | 3      | 0       | —                                            |
| q.getRecordsByTagName(…) → return                           | 3      | 0       | —                                            |
| tx.getChild(…) → return                                     | 3      | 0       | —                                            |
| tx.getChildren(…) → return                                  | 3      | 0       | —                                            |
| tx.getRecordsByTagName(…) → return                          | 3      | 0       | —                                            |
| doc.query.getChild(…) → return                              | 3      | 0       | —                                            |
| doc.query.getChildren(…) → return                           | 3      | 0       | —                                            |
| doc.query.getRecordsByTagName(…) → return                   | 3      | 0       | —                                            |

## Namespace type aliases (concrete `LNode` + wide `ElementsOf`)

| Member                                  | len   | members | causes          |
| --------------------------------------- | ----- | ------- | --------------- |
| Scl.ElementsOf                          | 3,432 | 0       | —               |
| Scl.ChildrenOf<ElementsOf>              | 3,424 | 0       | —               |
| Scl.DescendantsOf<ElementsOf>           | 3,424 | 0       | —               |
| Scl.AncestorsOf<ElementsOf>             | 2,439 | 0       | —               |
| Scl.ParentsOf<ElementsOf>               | 2,439 | 0       | —               |
| Scl.DescendantsOf                       | 434   | 0       | —               |
| Scl.AncestorsOf                         | 315   | 0       | —               |
| Scl.ParentsOf                           | 307   | 0       | —               |
| Scl.ChildrenOf                          | 114   | 0       | —               |
| Scl.Ref                                 | 56    | 1       | —               |
| Scl.AttributesValueObjectOf             | 54    | 0       | C1 module-noise |
| Scl.AttributesValueObjectOf<ElementsOf> | 27    | 0       | —               |
| Scl.FullAttributeObjectOf               | 24    | 0       | —               |
| Scl.SingletonElementsOf                 | 23    | 0       | —               |
| Scl.ParentRelationship<ElementsOf>      | 22    | 0       | —               |
| Scl.QualifiedAttribute<ElementsOf>      | 22    | 0       | —               |
| Scl.ChildRelationship<ElementsOf>       | 21    | 0       | —               |
| Scl.ParentRelationship                  | 21    | 0       | —               |
| Scl.QualifiedAttribute                  | 21    | 0       | —               |
| Scl.ChildRelationship                   | 20    | 0       | —               |
| Scl.TransactionHooks                    | 20    | 0       | —               |
| Scl.TrackedRecord<ElementsOf>           | 17    | 0       | —               |
| Scl.CloneMapping                        | 16    | 0       | —               |
| Scl.TrackedRecord                       | 16    | 0       | —               |
| Scl.AttributesOf                        | 15    | 0       | —               |
| Scl.Transaction                         | 15    | 0       | —               |
| Scl.TreeRecord<ElementsOf>              | 14    | 0       | —               |
| Scl.Attribute<ElementsOf>               | 13    | 0       | —               |
| Scl.Operation                           | 13    | 0       | —               |
| Scl.RawRecord<ElementsOf>               | 13    | 0       | —               |
| Scl.TreeRecord                          | 13    | 0       | —               |
| Scl.Attribute                           | 12    | 0       | —               |
| Scl.Document                            | 12    | 0       | —               |
| Scl.RawRecord                           | 12    | 0       | —               |
| Scl.Context                             | 11    | 0       | —               |
| Scl.Project                             | 10    | 0       | —               |
| Scl.Query                               | 9     | 0       | —               |
| Scl.Ref<ElementsOf>                     | 7     | 0       | —               |
| Scl.AttributesOf<ElementsOf>            | 5     | 0       | —               |
| Scl.FullAttributeObjectOf<ElementsOf>   | 5     | 0       | —               |
| Scl.RootElementOf                       | 5     | 0       | —               |

**Summary:** 144 methods, 26 namespace types, 159/333 rows flagged. Total 315,405 chars.
