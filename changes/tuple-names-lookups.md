### Performance

- A commit that creates a tuple target (an access point, a logical device, a logical node, a control block) looks up the references naming it by their uuid attributes, one value-list lookup per referrer tag and attribute, instead of reading every referrer of each tag. The names written are the same. On a 9.5 MB document, that step of the commit drops from about 30 ms to 1 ms on SQLite once the attribute index is built.
