import type { CollectSelect } from '../find/collect-with-ancestry.types'

/** The part of the document a logical node is found in: every IED down to its LN and LN0, nothing they hold. */
export const LOGICAL_NODES_SELECT = {
	IED: { AccessPoint: { Server: { LDevice: { LN0: {}, LN: {} } }, LN: {} } },
} satisfies CollectSelect
