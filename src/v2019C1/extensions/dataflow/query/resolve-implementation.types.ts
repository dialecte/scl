import type { IedNode } from './ied-section.types'

/**
 * What the ExtRef / ExtCtrl a signal names resolves to: the element, or none; `ambiguous` when its
 * address fits several elements and nothing tells them apart (then there is no element, and the
 * address is not one that names nothing).
 */
export type ImplementationResolution = {
	element: IedNode<'ExtRef' | 'ExtCtrl'> | undefined
	ambiguous: boolean
}
