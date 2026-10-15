import type { DerivedReferenceAttributesShape } from './types'

/**
 * The names of the levels holding a connectivity node, as a terminal lists them next to the
 * node's path: the processes (nested ones joined with "/"), the line, or the substation,
 * voltage level and bay, then the node itself. A level the node is not in is left out.
 */
const CONNECTIVITY_NODE_LEVEL_NAMES = [
	{ name: 'processName', from: 'Process' },
	{ name: 'lineName', from: 'Line' },
	{ name: 'substationName', from: 'Substation' },
	{ name: 'voltageLevelName', from: 'VoltageLevel' },
	{ name: 'bayName', from: 'Bay' },
	{ name: 'cNodeName', from: 'ConnectivityNode' },
] as const

/**
 * Attributes that are written from a path every time that path is, never given by the caller:
 * a terminal's level names follow the connectivity node its `connectivityNode` names, and a
 * connectivity node's `pathName` is its own path.
 */
export const DERIVED_REFERENCE_ATTRIBUTES = {
	ConnectivityNode: { follows: 'self', attributes: [{ name: 'pathName', from: 'path' }] },
	NeutralPoint: { follows: 'connectivityNode', attributes: CONNECTIVITY_NODE_LEVEL_NAMES },
	Terminal: { follows: 'connectivityNode', attributes: CONNECTIVITY_NODE_LEVEL_NAMES },
} as const satisfies DerivedReferenceAttributesShape
