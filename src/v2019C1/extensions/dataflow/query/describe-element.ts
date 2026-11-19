import { SUPERVISION_BY_CONTROL_BLOCK } from '../constants/supervision.constants'
import { extCtrlState } from './ext-ctrl-state'
import { extRefState } from './ext-ref-state'
import { findDanglingLinks } from './find-dangling-links'
import { readElementLinks } from './read-element-links'
import { resolveControlBlock } from './resolve-control-block'
import { resolveRegistration } from './resolve-registration'

import type { ExtCtrlState, ExtRefState, Supervision } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { ElementDescription } from './describe-element.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'

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
	const [attributes, supervision] = await Promise.all([
		context.query.any.getAttributes(element.record),
		controlBlock && supervisionOfElement({ controlBlock, element, context }),
	])
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
			(await resolveRegistration({
				controlBlock,
				extRef: element as IedNode<'ExtRef'>,
				context,
			})),
		...(supervision ? { supervision } : {}),
		dangling: findDanglingLinks({ element: element.ref, attributes, links }),
	}
}

/** The supervision of the control block an ExtRef names, in the IED holding the ExtRef; read only for a supervised kind. */
async function supervisionOfElement(params: {
	controlBlock: ControlBlockNode
	element: IedNode<'ExtRef' | 'ExtCtrl'>
	context: DataflowContext
}): Promise<Supervision | undefined> {
	const { controlBlock, element, context } = params
	if (!(controlBlock.record.tagName in SUPERVISION_BY_CONTROL_BLOCK)) return undefined
	const index = await context.supervisionIndex()
	return index.supervisionOf({ controlBlock, subscriber: element.ied })
}

/** The shape an ExtRef / ExtCtrl is written in, by its kind; `undefined` in none of the documented ones. */
function bindingOf(params: {
	tagName: string
	attributes: Readonly<Record<string, string>>
}): ExtRefState | ExtCtrlState | undefined {
	const { tagName, attributes } = params
	return tagName === 'ExtCtrl' ? extCtrlState({ attributes }) : extRefState({ attributes })
}
