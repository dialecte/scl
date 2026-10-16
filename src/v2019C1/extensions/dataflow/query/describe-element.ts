import { extCtrlState } from './ext-ctrl-state'
import { extRefState } from './ext-ref-state'
import { findDanglingLinks } from './find-dangling-links'
import { readElementLinks } from './read-element-links'
import { resolveControlBlock } from './resolve-control-block'
import { resolveRegistration } from './resolve-registration'

import { readRawAttributes } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { ExtCtrlState, ExtRefState } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { ElementDescription } from './describe-element.types'
import type { IedNode } from './ied-section.types'

/**
 * What an ExtRef / ExtCtrl is, read from the element alone: the shape it is written in, where it
 * sits, the control block it names with its publisher and the subscriber's registration on it, and
 * the uuids of its own that name nothing.
 */
export async function describeElement<GenericElement extends 'ExtRef' | 'ExtCtrl'>(params: {
	element: IedNode<GenericElement>
	context: DataflowContext
}): Promise<ElementDescription<GenericElement>> {
	const { element, context } = params
	const controlBlock =
		element.record.tagName === 'ExtRef'
			? await resolveControlBlock({ extRef: element as IedNode<'ExtRef'>, context })
			: undefined
	const attributes = readRawAttributes(element.record)
	const iedSection = await context.iedSection()
	const links = await readElementLinks({
		element,
		controlBlockFound: controlBlock !== undefined,
		context,
	})

	return {
		element: element.ref,
		binding: bindingOf({
			tagName: element.record.tagName,
			attributes,
		}) as ElementDescription<GenericElement>['binding'],
		ln: element.ln,
		ied: element.ied,
		controlBlock: controlBlock?.ref,
		publisher: controlBlock?.ied,
		registration:
			controlBlock &&
			resolveRegistration({
				controlBlock,
				extRef: element as IedNode<'ExtRef'>,
				iedSection,
			}),
		dangling: findDanglingLinks({ element: element.ref, attributes, links }),
	}
}

/** The shape an ExtRef / ExtCtrl is written in, by its kind; `undefined` in none of the documented ones. */
function bindingOf(params: {
	tagName: string
	attributes: Readonly<Record<string, string>>
}): ExtRefState | ExtCtrlState | undefined {
	const { tagName, attributes } = params
	return tagName === 'ExtCtrl' ? extCtrlState({ attributes }) : extRefState({ attributes })
}
