### Changed

- The commit's steps run as one ordered list over one state, each reading what every step before it wrote; the commit's prune now judges a container with the names the commit writes too, with no change to what it removes. Internal: no public API changes.
