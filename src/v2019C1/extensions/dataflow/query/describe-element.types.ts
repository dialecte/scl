import type { ExtCtrlState, ExtRefState, SpecifiedDataflow } from '../dataflow.types'

/**
 * What an ExtRef / ExtCtrl is, without the signal that names it: its `binding` is the state of its
 * kind, absent when it is written in none of the documented shapes.
 */
export type ElementDescription<GenericElement extends 'ExtRef' | 'ExtCtrl'> = Omit<
	SpecifiedDataflow['implementation'],
	'state' | 'binding'
> & {
	binding: GenericElement extends 'ExtRef' ? ExtRefState | undefined : ExtCtrlState | undefined
}
