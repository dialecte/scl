### Changed

- The commit's steps run as one ordered list over one state, each reading what every step before it wrote. The commit's prune removes the same containers as before; an update it stages for an element losing a pruned child now keeps the names the commit wrote on it. Internal: no public API changes.
