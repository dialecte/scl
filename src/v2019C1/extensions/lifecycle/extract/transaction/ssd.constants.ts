import type { IedSelectionRule } from './extract.types'

/** Every IED an LNode of the scope is tied to, whatever its kind or assignment: the default of an SSD extract. */
export const ALL_BOUND_IEDS: IedSelectionRule = {
	specification: 'carry',
	implemented: 'carry',
	shared: 'carry',
}

/**
 * A reusable template's IEDs: the specification IEDs the scope alone uses; a real IED, or one also serving LNodes
 * outside the scope (a station HMI, a gateway), is left out and its LNodes released.
 */
export const TEMPLATE_IED_SELECTION: IedSelectionRule = {
	specification: 'carry',
	implemented: 'leave-out',
	shared: 'leave-out',
}
