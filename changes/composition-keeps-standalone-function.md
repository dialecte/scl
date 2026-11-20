### Changed

- An SSD update (template or fork, the specification beside an IED included) no longer removes a function an application stops composing when the newer revision holds it as a standalone function of the same scope: it is updated as a standalone function, and only the application's `FunctionRef` change is listed. Before, it was listed as the application's dropped function (`removed`, or `target-only` in a fork) and accepting every group deleted it. An application updated on its own (`verb: 'asd'`) is unchanged.
