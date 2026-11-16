/** The tags on the way from an IED down to its logical nodes, the logical nodes included. */
export const WAY_TO_LOGICAL_NODES: ReadonlySet<string> = new Set([
	'AccessPoint',
	'Server',
	'LDevice',
	'LN',
	'LN0',
])

/** The logical node tags. */
export const LOGICAL_NODE_TAGS: ReadonlySet<string> = new Set(['LN', 'LN0'])
