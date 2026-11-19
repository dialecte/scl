### Changed

- A rename of an IED, access point, logical device, logical node or control block finds the tuple references to follow by attribute lookups instead of reading every element of each referrer tag: one lookup per referrer tag and uuid attribute, with every uuid of the renamed subtree at once. An IED rename also looks up the IEDs holding its old or new name, the references naming it by their IED attribute and the `LNodeSpecNaming` naming it. Only `IEDName`, which names its IED by its text, is still read whole. The operations written and their order are unchanged.
