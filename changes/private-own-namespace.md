### Fixed

- A `Private` of another namespace (a vendor's `<v:Private xmlns:v="…">`) is read as an ordinary element, as core 0.16 and later read it: a key held inside it is unique under it, a placed instance's diff lists it as the project's own instead of its children, and `transplant.deep` no longer merges it into the SCL `Private` of the same `type` (nor an SCL `Private` into it). SCL documents answer as before.
