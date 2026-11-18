### Performance

- **A delete reads only the references naming what it removes.** The references a delete leaves naming a removed element (by uuid) are looked up by the uuids of the removed elements, one search per reference tag and uuid attribute, instead of reading every reference of each tag; the parents that stay and lose children are read together in one read (was one read each). The same references are cleared or deleted, in the same order, and the same operations staged.
