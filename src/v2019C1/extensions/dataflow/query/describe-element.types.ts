import type { ExtCtrlState, ExtRefState, SpecifiedDataflow } from '../dataflow.types'

/**
 * What an ExtRef / ExtCtrl is, without the signal that names it: its `binding` is always set, of
 * the ladder of its kind.
 */
export type ElementDescription<GenericElement extends 'ExtRef' | 'ExtCtrl'> = Omit<
	SpecifiedDataflow['implementation'],
	'state' | 'binding'
> & {
	binding: GenericElement extends 'ExtRef' ? ExtRefState : ExtCtrlState
}
