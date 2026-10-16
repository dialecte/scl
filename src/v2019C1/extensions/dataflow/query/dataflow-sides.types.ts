import type { Scl } from '@/v2019C1/config'

/**
 * The two IEDs a dataflow runs between: `near` holds what implements it (or, while nothing does,
 * the logical node holding its signal), `far` is the one it takes its data from or controls (the
 * IED publishing it, else the IED its element names, else the IED of the other logical node).
 * Either is `undefined` while it is not known.
 */
export type DataflowSides = {
	near: Scl.Ref<'IED'> | undefined
	far: Scl.Ref<'IED'> | undefined
}
