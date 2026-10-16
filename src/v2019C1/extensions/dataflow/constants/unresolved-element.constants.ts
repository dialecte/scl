import type { SpecifiedDataflow } from '../dataflow.types'

/** What is known of an implementation whose element is not resolved: nothing, and no uuid of its own naming nothing. */
export const UNRESOLVED_ELEMENT: Omit<SpecifiedDataflow['implementation'], 'state'> = {
	element: undefined,
	binding: undefined,
	ln: undefined,
	ied: undefined,
	controlBlock: undefined,
	publisher: undefined,
	registration: undefined,
	dangling: [],
}
